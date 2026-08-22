import { Injectable, Logger } from '@nestjs/common';
import { Prisma, WithdrawalStatus } from '@dialectiva/db';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { PlatformSettingsService } from '../settings/platform-settings.service';
import { NowPaymentsService } from './nowpayments.service';

const NOWPAYMENTS_PAYOUT_FINISHED_STATUSES = new Set([
  'finished',
  'paid',
  'complete',
  'completed',
  'success',
]);
const NOWPAYMENTS_PAYOUT_FAILED_STATUSES = new Set([
  'failed',
  'rejected',
  'expired',
  'cancelled',
  'canceled',
]);

/** How long a PROCESSING withdrawal can go without a status change before it's logged as stuck (payout-automation plan point 9's "alert/log if stale too long"). */
const STALE_PROCESSING_HOURS = 24;

/**
 * Background reconciliation for withdrawals submitted to NOWPayments
 * (payout-automation plan point 9). Run on a schedule via
 * `npm run withdrawal-reconcile` / the withdrawal-reconcile k8s CronJob --
 * a standalone one-shot invocation of this service, same shape as
 * settlement-job's SettlementService.run(), kept inside services/api
 * (rather than a separate service) so it can reuse NowPaymentsService's
 * auth/client code instead of duplicating it.
 */
@Injectable()
export class WithdrawalReconciliationService {
  private readonly logger = new Logger(WithdrawalReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly nowPayments: NowPaymentsService,
    private readonly platformSettings: PlatformSettingsService,
  ) {}

  async run(): Promise<{
    checked: number;
    paid: number;
    failed: number;
    stillProcessing: number;
    stale: number;
  }> {
    if (!(await this.platformSettings.isNowPaymentsPayoutsEnabled())) {
      this.logger.log('NOWPayments payouts disabled -- skipping reconciliation');
      return { checked: 0, paid: 0, failed: 0, stillProcessing: 0, stale: 0 };
    }

    const processing = await this.prisma.withdrawalRequest.findMany({
      where: { status: WithdrawalStatus.PROCESSING, providerPayoutId: { not: null } },
      select: { id: true, providerPayoutId: true, submittedToProviderAt: true },
    });

    let paid = 0;
    let failed = 0;
    let stillProcessing = 0;
    let stale = 0;
    const now = Date.now();

    for (const withdrawal of processing) {
      try {
        const result = await this.nowPayments.getPayoutStatus(withdrawal.providerPayoutId!);
        const status = this.mapProviderPayoutStatus(result.status);

        if (status === WithdrawalStatus.PROCESSING) {
          stillProcessing += 1;
          const submittedAt = withdrawal.submittedToProviderAt?.getTime();
          const staleForHours = submittedAt ? (now - submittedAt) / (60 * 60 * 1000) : 0;
          if (staleForHours > STALE_PROCESSING_HOURS) {
            stale += 1;
            this.logger.warn(
              `Withdrawal stuck PROCESSING for ${staleForHours.toFixed(1)}h: withdrawal=${withdrawal.id} providerPayoutId=${withdrawal.providerPayoutId}`,
            );
          }
        } else if (status === WithdrawalStatus.PAID) {
          paid += 1;
        } else {
          failed += 1;
        }

        await this.recordStatus(
          withdrawal.id,
          withdrawal.providerPayoutId!,
          status,
          result.status,
          result.raw,
        );
      } catch (err) {
        // A poll failure (network error, provider 5xx) is transient -- it
        // must never flip the withdrawal to FAILED itself (that's reserved
        // for a provider-reported terminal failure status). Log and leave
        // the row PROCESSING for the next run to retry.
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(`Reconciliation poll failed for withdrawal=${withdrawal.id}: ${message}`);
      }
    }

    this.logger.log(
      `Withdrawal reconciliation: checked=${processing.length} paid=${paid} failed=${failed} stillProcessing=${stillProcessing} stale=${stale}`,
    );
    return { checked: processing.length, paid, failed, stillProcessing, stale };
  }

  private mapProviderPayoutStatus(status: string | null | undefined): WithdrawalStatus {
    const normalized = status?.toLowerCase();
    if (normalized && NOWPAYMENTS_PAYOUT_FINISHED_STATUSES.has(normalized))
      return WithdrawalStatus.PAID;
    if (normalized && NOWPAYMENTS_PAYOUT_FAILED_STATUSES.has(normalized))
      return WithdrawalStatus.FAILED;
    return WithdrawalStatus.PROCESSING;
  }

  private async recordStatus(
    withdrawalId: string,
    providerPayoutId: string,
    status: WithdrawalStatus,
    providerStatus: string | null,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.withdrawalRequest.update({
        where: { id: withdrawalId },
        data: {
          status,
          providerStatus: providerStatus ?? undefined,
          providerPayload: payload as Prisma.InputJsonValue,
          providerError:
            status === WithdrawalStatus.FAILED
              ? (providerStatus ?? 'provider reported a terminal failure')
              : null,
          providerSettledAt: status === WithdrawalStatus.PAID ? now : undefined,
          resolvedAt: status === WithdrawalStatus.PAID ? now : undefined,
        },
      }),
      this.prisma.nowPaymentsPayoutEvent.create({
        data: {
          eventHash: randomUUID(),
          withdrawalRequestId: withdrawalId,
          providerPayoutId,
          eventType: 'reconcile',
          providerStatus,
          payload: payload as Prisma.InputJsonValue,
        },
      }),
    ]);
  }
}

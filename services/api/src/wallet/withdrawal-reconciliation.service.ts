import { Injectable, Logger } from '@nestjs/common';
import { Prisma, WithdrawalStatus } from '@dialectiva/db';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { PlatformSettingsService } from '../settings/platform-settings.service';
import { NowPaymentsService } from './nowpayments.service';
import { FlutterwaveService } from './flutterwave.service';
import { FlutterwaveV4Service } from './flutterwave-v4.service';

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
const FLUTTERWAVE_TRANSFER_FINISHED_STATUSES = new Set(['successful']);
const FLUTTERWAVE_TRANSFER_FAILED_STATUSES = new Set(['failed', 'cancelled']);
// v4 transfer status enum is the same 6 values as v3 -- kept as a separate
// constant so a future divergence doesn't require re-splitting this later.
const FLUTTERWAVE_V4_TRANSFER_FINISHED_STATUSES = new Set(['successful']);
const FLUTTERWAVE_V4_TRANSFER_FAILED_STATUSES = new Set(['failed', 'cancelled']);

/** How long a PROCESSING withdrawal can go without a status change before it's logged as stuck (payout-automation plan point 9's "alert/log if stale too long"). */
const STALE_PROCESSING_HOURS = 24;

interface ReconcileTally {
  checked: number;
  paid: number;
  failed: number;
  stillProcessing: number;
  stale: number;
}

/**
 * Background reconciliation for withdrawals submitted to NOWPayments or
 * Flutterwave (payout-automation plan point 9). Run on a schedule via
 * `npm run withdrawal-reconcile` / the withdrawal-reconcile k8s CronJob --
 * a standalone one-shot invocation of this service, same shape as
 * settlement-job's SettlementService.run(), kept inside services/api
 * (rather than a separate service) so it can reuse NowPaymentsService's/
 * FlutterwaveService's auth/client code instead of duplicating it. Each
 * provider gets its own poll loop (filtered by `provider` on the query and
 * gated by that provider's own kill switch) rather than one generic loop,
 * since the two providers' status-mapping and payout-event tables are
 * already kept separate everywhere else in this codebase.
 */
@Injectable()
export class WithdrawalReconciliationService {
  private readonly logger = new Logger(WithdrawalReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly nowPayments: NowPaymentsService,
    private readonly flutterwave: FlutterwaveService,
    private readonly flutterwaveV4: FlutterwaveV4Service,
    private readonly platformSettings: PlatformSettingsService,
  ) {}

  async run(): Promise<{
    nowpayments: ReconcileTally;
    flutterwave: ReconcileTally;
    flutterwaveV4: ReconcileTally;
  }> {
    const [nowpayments, flutterwave, flutterwaveV4] = await Promise.all([
      this.runNowPayments(),
      this.runFlutterwave(),
      this.runFlutterwaveV4(),
    ]);
    return { nowpayments, flutterwave, flutterwaveV4 };
  }

  private async runNowPayments(): Promise<ReconcileTally> {
    if (!(await this.platformSettings.isNowPaymentsPayoutsEnabled())) {
      this.logger.log('NOWPayments payouts disabled -- skipping reconciliation');
      return { checked: 0, paid: 0, failed: 0, stillProcessing: 0, stale: 0 };
    }

    const processing = await this.prisma.withdrawalRequest.findMany({
      where: {
        status: WithdrawalStatus.PROCESSING,
        provider: 'nowpayments',
        providerPayoutId: { not: null },
      },
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
        const status = this.mapNowPaymentsStatus(result.status);

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

        await this.recordNowPaymentsStatus(
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
      `NOWPayments withdrawal reconciliation: checked=${processing.length} paid=${paid} failed=${failed} stillProcessing=${stillProcessing} stale=${stale}`,
    );
    return { checked: processing.length, paid, failed, stillProcessing, stale };
  }

  private async runFlutterwave(): Promise<ReconcileTally> {
    if (!(await this.platformSettings.isFlutterwavePayoutsEnabled())) {
      this.logger.log('Flutterwave payouts disabled -- skipping reconciliation');
      return { checked: 0, paid: 0, failed: 0, stillProcessing: 0, stale: 0 };
    }

    const processing = await this.prisma.withdrawalRequest.findMany({
      where: {
        status: WithdrawalStatus.PROCESSING,
        provider: 'flutterwave',
        providerPayoutId: { not: null },
      },
      select: { id: true, providerPayoutId: true, submittedToProviderAt: true },
    });

    let paid = 0;
    let failed = 0;
    let stillProcessing = 0;
    let stale = 0;
    const now = Date.now();

    for (const withdrawal of processing) {
      try {
        const result = await this.flutterwave.getTransferStatus(withdrawal.providerPayoutId!);
        const status = this.mapFlutterwaveStatus(result.status);

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

        await this.recordFlutterwaveStatus(
          withdrawal.id,
          withdrawal.providerPayoutId!,
          status,
          result.status,
          result.raw,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(`Reconciliation poll failed for withdrawal=${withdrawal.id}: ${message}`);
      }
    }

    this.logger.log(
      `Flutterwave withdrawal reconciliation: checked=${processing.length} paid=${paid} failed=${failed} stillProcessing=${stillProcessing} stale=${stale}`,
    );
    return { checked: processing.length, paid, failed, stillProcessing, stale };
  }

  /**
   * v4 counterpart to runFlutterwave -- separate loop (not folded into the
   * v3 one) since the two rails write to different WithdrawalRequest.provider
   * tags and different payout-event tables (FlutterwaveV4TransferEvent vs
   * FlutterwavePayoutEvent), matching the existing "each provider gets its
   * own loop" convention this class already follows for NOWPayments vs v3.
   * Gated by the same isFlutterwavePayoutsEnabled kill switch as v3 --
   * there's no separate v4-only payouts toggle, only isFlutterwaveV4Enabled
   * (which decides which rail NEW submissions use, not whether existing v4
   * withdrawals still get reconciled).
   */
  private async runFlutterwaveV4(): Promise<ReconcileTally> {
    if (!(await this.platformSettings.isFlutterwavePayoutsEnabled())) {
      this.logger.log('Flutterwave payouts disabled -- skipping v4 reconciliation');
      return { checked: 0, paid: 0, failed: 0, stillProcessing: 0, stale: 0 };
    }

    const processing = await this.prisma.withdrawalRequest.findMany({
      where: {
        status: WithdrawalStatus.PROCESSING,
        provider: 'flutterwave-v4',
        providerPayoutId: { not: null },
      },
      select: { id: true, providerPayoutId: true, submittedToProviderAt: true },
    });

    let paid = 0;
    let failed = 0;
    let stillProcessing = 0;
    let stale = 0;
    const now = Date.now();

    for (const withdrawal of processing) {
      try {
        const result = await this.flutterwaveV4.getTransferStatus(withdrawal.providerPayoutId!);
        const status = this.mapFlutterwaveV4Status(result.status);

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

        await this.recordFlutterwaveV4Status(
          withdrawal.id,
          withdrawal.providerPayoutId!,
          status,
          result.status,
          result.raw,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(`Reconciliation poll failed for withdrawal=${withdrawal.id}: ${message}`);
      }
    }

    this.logger.log(
      `Flutterwave v4 withdrawal reconciliation: checked=${processing.length} paid=${paid} failed=${failed} stillProcessing=${stillProcessing} stale=${stale}`,
    );
    return { checked: processing.length, paid, failed, stillProcessing, stale };
  }

  private mapNowPaymentsStatus(status: string | null | undefined): WithdrawalStatus {
    const normalized = status?.toLowerCase();
    if (normalized && NOWPAYMENTS_PAYOUT_FINISHED_STATUSES.has(normalized))
      return WithdrawalStatus.PAID;
    if (normalized && NOWPAYMENTS_PAYOUT_FAILED_STATUSES.has(normalized))
      return WithdrawalStatus.FAILED;
    return WithdrawalStatus.PROCESSING;
  }

  private mapFlutterwaveStatus(status: string | null | undefined): WithdrawalStatus {
    const normalized = status?.toLowerCase();
    if (normalized && FLUTTERWAVE_TRANSFER_FINISHED_STATUSES.has(normalized))
      return WithdrawalStatus.PAID;
    if (normalized && FLUTTERWAVE_TRANSFER_FAILED_STATUSES.has(normalized))
      return WithdrawalStatus.FAILED;
    return WithdrawalStatus.PROCESSING;
  }

  private mapFlutterwaveV4Status(status: string | null | undefined): WithdrawalStatus {
    const normalized = status?.toLowerCase();
    if (normalized && FLUTTERWAVE_V4_TRANSFER_FINISHED_STATUSES.has(normalized))
      return WithdrawalStatus.PAID;
    if (normalized && FLUTTERWAVE_V4_TRANSFER_FAILED_STATUSES.has(normalized))
      return WithdrawalStatus.FAILED;
    return WithdrawalStatus.PROCESSING;
  }

  private async recordNowPaymentsStatus(
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

  private async recordFlutterwaveStatus(
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
      this.prisma.flutterwavePayoutEvent.create({
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

  private async recordFlutterwaveV4Status(
    withdrawalId: string,
    transferId: string,
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
      this.prisma.flutterwaveV4TransferEvent.create({
        data: {
          eventHash: randomUUID(),
          withdrawalRequestId: withdrawalId,
          transferId,
          eventType: 'reconcile',
          providerStatus,
          payload: payload as Prisma.InputJsonValue,
        },
      }),
    ]);
  }
}

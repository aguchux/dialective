import {
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  Prisma,
  LedgerEntryType,
  RoyaltyWithdrawalStatus,
  PayoutAccountType,
} from '@dialectiva/db';
import { PrismaService } from '../../prisma/prisma.service';
import { PlatformSettingsService } from '../../settings/platform-settings.service';
import { planWithdrawalReversal } from '../../wallet/withdrawal-reversal.util';
import { isRejectedKycStatus } from '../../wallet/kyc-withdrawal-gate.util';

export interface CreateRoyaltyWithdrawalInput {
  userId: string;
  tokenAmount: number;
  payoutAccountId: string;
}

export interface RoyaltyWithdrawalCreated {
  withdrawalId: string;
  status: RoyaltyWithdrawalStatus;
  tokenAmount: string;
  usdAmount: string;
}

/**
 * Royalty payouts: debits `Wallet.royaltyBalance` on the existing payout rails.
 *
 * Its own model and its own service rather than extending the wallet withdrawal
 * path, per section 8 of docs/Stream-Revenue-Sharing-Engine.md. Two reasons, and
 * the second is the one that matters:
 *
 * 1. The two rails debit different columns and write different ledger types.
 * 2. The existing path's compensating-delete clears ledger rows by `reference`
 *    with **no type filter** (`ledgerEntry.deleteMany({ where: { reference } })`).
 *    Sharing a table would let one rail's rollback delete the other rail's
 *    ledger row. Separate tables make that impossible rather than unlikely.
 *
 * **One column per request, always.** A withdrawal never spends across
 * `balance` and `royaltyBalance`: that cannot be expressed as a single atomic
 * `updateMany` guard, so it would reintroduce the read-then-write race the
 * wallet ledger is careful to avoid everywhere else.
 *
 * `PayoutAccount` is reused unchanged. A contributor receiving royalties is the
 * same `User` who already withdraws DL, and their bank details do not differ by
 * which balance funded the payout.
 */
@Injectable()
export class RoyaltyWithdrawalService {
  private readonly logger = new Logger(RoyaltyWithdrawalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: PlatformSettingsService,
  ) {}

  /**
   * Validate a request without executing it.
   *
   * Called by the OTP-issuing route as well as the executing one, so a code is
   * never issued for a request that would be refused anyway -- and so the
   * contributor learns why before being asked for a code.
   */
  async validate(input: CreateRoyaltyWithdrawalInput): Promise<void> {
    if (!(await this.settings.areRoyaltiesEnabled())) {
      throw new UnprocessableEntityException('Stream revenue sharing is not enabled');
    }
    if (!Number.isFinite(input.tokenAmount) || input.tokenAmount <= 0) {
      throw new UnprocessableEntityException('Withdrawal amount must be positive');
    }

    const minimum = await this.settings.getRoyaltyMinimumPayout();
    if (input.tokenAmount < minimum) {
      // Rolls forward rather than paying out. Framed as "keeps accruing"
      // deliberately: nothing is lost, and a contributor reading this should not
      // think their earnings were refused.
      throw new UnprocessableEntityException(
        `Royalty payouts start at ${minimum} DL. Your balance keeps accruing until it reaches that.`,
      );
    }

    await this.resolvePayoutAccount(input.userId, input.payoutAccountId);
    await this.requireKyc(input.userId, input.tokenAmount);

    const wallet = await this.prisma.wallet.findUnique({
      where: { userId: input.userId },
      select: { royaltyBalance: true },
    });
    // A read-only pre-check for a clear error message. It is NOT the guard --
    // that is the atomic updateMany in create(). Two concurrent requests can
    // both pass here and only one can pass there.
    if (!wallet || wallet.royaltyBalance.lessThan(input.tokenAmount)) {
      throw new UnprocessableEntityException('Insufficient royalty balance');
    }
  }

  /**
   * Create the request and debit `royaltyBalance`, atomically.
   *
   * The debit is a guarded `updateMany` -- never read-then-compare-then-update.
   * Postgres evaluates `royaltyBalance >= amount` as part of the row update, so
   * two simultaneous requests against one wallet cannot both pass a check taken
   * before either debit landed.
   *
   * Unlike the wallet path, which creates rows and then compensates by deleting
   * them when the debit misses, this checks the debit FIRST and writes the
   * request only if it succeeded. There is nothing to compensate, so there is no
   * untyped delete to get wrong.
   */
  async create(input: CreateRoyaltyWithdrawalInput): Promise<RoyaltyWithdrawalCreated> {
    await this.validate(input);

    const wallet = await this.prisma.wallet.findUnique({
      where: { userId: input.userId },
      select: { id: true },
    });
    if (!wallet) throw new UnprocessableEntityException('Insufficient royalty balance');

    const amount = new Prisma.Decimal(input.tokenAmount);
    const tokenUsdRate = await this.settings.getTokenUsdRate();
    const usdAmount = amount.times(tokenUsdRate);

    return this.prisma.$transaction(async (tx) => {
      // THE guard. Everything below it only runs because the balance covered it.
      const debit = await tx.wallet.updateMany({
        where: { id: wallet.id, royaltyBalance: { gte: amount } },
        data: { royaltyBalance: { decrement: amount } },
      });
      if (debit.count === 0) {
        // Lost a race, or the balance moved since validate(). Nothing has been
        // written, so the transaction simply aborts -- no phantom request row
        // and no ledger entry to clean up.
        throw new UnprocessableEntityException('Insufficient royalty balance');
      }

      const request = await tx.royaltyWithdrawalRequest.create({
        data: {
          walletId: wallet.id,
          tokenAmount: amount,
          usdAmount,
          payoutAccountId: input.payoutAccountId,
          status: RoyaltyWithdrawalStatus.PENDING,
        },
        select: { id: true, status: true },
      });

      await tx.ledgerEntry.create({
        data: {
          walletId: wallet.id,
          type: LedgerEntryType.ROYALTY_WITHDRAWAL,
          // Negative: DL leaving the contributor's royalty balance.
          amount: amount.neg(),
          reference: request.id,
        },
      });

      this.logger.log(
        `Royalty withdrawal requested: user=${input.userId} amount=${amount.toString()} DL request=${request.id}`,
      );
      return {
        withdrawalId: request.id,
        status: request.status,
        tokenAmount: amount.toString(),
        usdAmount: usdAmount.toString(),
      };
    });
  }

  /** A contributor's own royalty withdrawal history. */
  async listForUser(userId: string) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!wallet) return [];
    return this.prisma.royaltyWithdrawalRequest.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        tokenAmount: true,
        usdAmount: true,
        status: true,
        adminNote: true,
        createdAt: true,
        resolvedAt: true,
      },
    });
  }

  /**
   * Admin resolution: mark a request paid, or reject and return the DL.
   *
   * The status is claimed with a guarded `updateMany` before anything else, so a
   * double-click cannot resolve twice -- on the `paid` branch that would send a
   * second "you've been paid" notification over what may have been a second real
   * transfer.
   *
   * On rejection the DL returns to `royaltyBalance`, never to `balance`. That
   * routing goes through `planWithdrawalReversal`, the same helper the wallet
   * rail uses, called with the full amount marked royalty-funded -- so the rule
   * lives in exactly one place for both rails.
   */
  async resolve(input: {
    withdrawalId: string;
    outcome: 'paid' | 'rejected';
    adminId: string;
    adminNote?: string;
  }) {
    const existing = await this.prisma.royaltyWithdrawalRequest.findUnique({
      where: { id: input.withdrawalId },
      select: { id: true, walletId: true, tokenAmount: true, status: true },
    });
    if (!existing) throw new NotFoundException('Royalty withdrawal not found');
    if (
      existing.status === RoyaltyWithdrawalStatus.PAID ||
      existing.status === RoyaltyWithdrawalStatus.REJECTED
    ) {
      throw new UnprocessableEntityException('This royalty withdrawal is already resolved');
    }

    const nextStatus =
      input.outcome === 'paid'
        ? RoyaltyWithdrawalStatus.PAID
        : RoyaltyWithdrawalStatus.REJECTED;

    return this.prisma.$transaction(async (tx) => {
      const claim = await tx.royaltyWithdrawalRequest.updateMany({
        where: { id: existing.id, status: existing.status },
        data: {
          status: nextStatus,
          resolvedAt: new Date(),
          approvedByAdminId: input.adminId,
          approvedAt: new Date(),
          adminNote: input.adminNote,
        },
      });
      if (claim.count === 0) {
        throw new UnprocessableEntityException(
          'This royalty withdrawal was updated by someone else -- reload and try again',
        );
      }

      if (input.outcome === 'rejected') {
        // royaltyFundedAmount equals the whole amount: a royalty withdrawal is
        // funded entirely from royaltyBalance, by construction (section 8's
        // one-column rule). The helper therefore returns exactly one write, to
        // royaltyBalance.
        const reversals = planWithdrawalReversal({
          id: existing.id,
          walletId: existing.walletId,
          tokenAmount: existing.tokenAmount,
          royaltyFundedAmount: existing.tokenAmount,
        });
        for (const reversal of reversals) {
          await tx.ledgerEntry.create({
            data: {
              walletId: existing.walletId,
              type: reversal.type,
              amount: reversal.amount,
              reference: existing.id,
            },
          });
          await tx.wallet.update({
            where: { id: existing.walletId },
            data: { [reversal.column]: { increment: reversal.amount } },
          });
        }
      }

      this.logger.log(
        `Royalty withdrawal resolved: admin=${input.adminId} request=${existing.id} outcome=${input.outcome}`,
      );
      return { withdrawalId: existing.id, status: nextStatus };
    });
  }

  /**
   * The payout destination, verified to belong to this contributor.
   *
   * Ownership is checked here rather than trusted from the request body, which
   * is the same rule every other fund-moving route in this repo follows: never
   * accept an id that identifies someone else's money.
   */
  private async resolvePayoutAccount(userId: string, payoutAccountId: string) {
    const account = await this.prisma.payoutAccount.findFirst({
      where: { id: payoutAccountId, userId },
      select: { id: true, type: true, verificationStatus: true },
    });
    if (!account) {
      throw new NotFoundException('Payout account not found');
    }
    // A STRIPE_CONNECT account that never finished onboarding cannot receive a
    // transfer, so refusing here beats a provider failure after the DL has
    // already been debited.
    if (
      account.type === PayoutAccountType.STRIPE_CONNECT &&
      account.verificationStatus !== 'VERIFIED'
    ) {
      throw new UnprocessableEntityException(
        'Finish setting up this payout account before withdrawing',
      );
    }
    return account;
  }

  /**
   * KYC, at the platform's existing threshold.
   *
   * Reads the same `PlatformSettings` gate and the same `User.kycStatus` the
   * wallet rail does, deliberately: a contributor who must verify their identity
   * to withdraw DL they earned by recording must also verify it to withdraw DL
   * they earned by being streamed. A softer gate on this rail would be an
   * obvious route around the harder one.
   */
  private async requireKyc(userId: string, tokenAmount: number): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { kycStatus: true },
    });
    if (!user) throw new NotFoundException('User not found');
    if (user.kycStatus === 'APPROVED') return;
    if (!(await this.settings.isKycRequiredForWithdrawals())) return;

    // A resolved negative verdict blocks at any amount; the threshold below
    // only exempts contributors who simply have not completed KYC yet. Same
    // distinction the wallet rail draws, from the same shared status list.
    if (isRejectedKycStatus(user.kycStatus)) {
      throw new UnprocessableEntityException(
        'Your identity verification was not approved. Please resubmit before requesting a payout',
      );
    }
    // Below the threshold is exempt; at or above it requires verification.
    // Same direction as the wallet rail -- inverting this would let the largest
    // payouts through unverified.
    const kycMinTokens = await this.settings.getKycMinWithdrawalTokens();
    if (tokenAmount < kycMinTokens) return;
    throw new UnprocessableEntityException(
      'Complete identity verification before requesting a payout',
    );
  }
}

import { BadRequestException, Injectable } from '@nestjs/common';
import {
  Prisma,
  ReserveDirection,
  ReserveTransactionStatus,
  ReserveTransactionType,
  TokenAccountKind,
  TokenomicsPolicy,
  TokenOperationStatus,
  TokenOperationType,
} from '@dialectiva/db';
import { PrismaService } from '../prisma/prisma.service';
import { PlatformSettingsService } from '../settings/platform-settings.service';
import { ListReserveTransactionsDto } from './dto/list-reserve-transactions.dto';
import { ListTokenOperationsDto } from './dto/list-token-operations.dto';
import { UpdateTokenomicsPolicyDto } from './dto/update-tokenomics-policy.dto';

type DbClient = PrismaService | Prisma.TransactionClient;

export interface ConfirmedNowPaymentsReserveInput {
  depositId: string;
  providerChargeId: string;
  providerPaymentId?: string | null;
  currency: string;
  usdAmount: Prisma.Decimal | number | string;
  actuallyPaid?: Prisma.Decimal | number | string | null;
  payCurrency?: string | null;
}

export interface ConfirmedFlutterwaveReserveInput {
  depositId: string;
  flutterwaveTxId: string;
  txRef: string;
  currency: string;
  usdAmount: Prisma.Decimal | number | string;
}

export interface LockUnlockInput {
  amount: Prisma.Decimal | number | string;
  idempotencyKey: string;
  reference?: string | null;
  reason?: string | null;
}

export interface BurnInput {
  amount: Prisma.Decimal | number | string;
  idempotencyKey: string;
  reason?: string | null;
}

export type ReserveHealthStatus = 'HEALTHY' | 'WATCH' | 'RESTRICTED' | 'CRITICAL';

/**
 * Canonical reserve and valuation read-model. This intentionally does not
 * mutate legacy Wallet balances: callers move to TokenAccount in explicit,
 * audited migrations rather than risking a partial balance cut-over.
 */
@Injectable()
export class TokenomicsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly platformSettings: PlatformSettingsService,
  ) {}

  async recordConfirmedNowPaymentsDeposit(input: ConfirmedNowPaymentsReserveInput) {
    return this.prisma.$transaction((tx) => this.recordConfirmedNowPaymentsDepositTx(tx, input));
  }

  async recordConfirmedNowPaymentsDepositTx(
    tx: Prisma.TransactionClient,
    input: ConfirmedNowPaymentsReserveInput,
  ) {
    const asset = (input.payCurrency ?? input.currency).toUpperCase();
    const network = asset === 'USDT' || asset === 'USDTTRC20' ? 'TRC20' : '';
    const reserveAccount = await tx.reserveAccount.upsert({
      where: { provider_asset_network: { provider: 'nowpayments', asset, network } },
      update: {},
      create: { provider: 'nowpayments', asset, network, currency: 'USD' },
    });

    const amount = new Prisma.Decimal(input.actuallyPaid ?? input.usdAmount);
    const normalizedUsd = new Prisma.Decimal(input.usdAmount);
    if (amount.lte(0) || normalizedUsd.lte(0)) {
      throw new BadRequestException('A confirmed provider payment must have a positive amount');
    }

    return tx.reserveTransaction.upsert({
      where: { idempotencyKey: `nowpayments:deposit:${input.depositId}` },
      update: {},
      create: {
        reserveAccountId: reserveAccount.id,
        type: ReserveTransactionType.PAYMENT_FUNDING,
        status: ReserveTransactionStatus.ELIGIBLE,
        direction: ReserveDirection.CREDIT,
        amount,
        eligibleUsdAmount: normalizedUsd,
        normalizationRate: normalizedUsd.div(amount),
        providerReference: input.providerPaymentId ?? input.providerChargeId,
        sourceReference: input.depositId,
        idempotencyKey: `nowpayments:deposit:${input.depositId}`,
        reason: 'Signature-verified NOWPayments payment',
        metadata: {
          providerChargeId: input.providerChargeId,
          providerPaymentId: input.providerPaymentId ?? null,
          requestedCurrency: input.currency,
          payCurrency: input.payCurrency ?? null,
        },
        settledAt: new Date(),
      },
    });
  }

  /**
   * Parallel to recordConfirmedNowPaymentsDepositTx rather than a shared,
   * provider-parametrized method -- keeps this new rail from touching the
   * already-working NOWPayments reserve-crediting path (same reasoning as
   * FlutterwaveWebhookEvent/FlutterwavePayoutEvent being separate tables
   * rather than a generic discriminated one).
   */
  async recordConfirmedFlutterwaveDeposit(input: ConfirmedFlutterwaveReserveInput) {
    return this.prisma.$transaction((tx) => this.recordConfirmedFlutterwaveDepositTx(tx, input));
  }

  async recordConfirmedFlutterwaveDepositTx(
    tx: Prisma.TransactionClient,
    input: ConfirmedFlutterwaveReserveInput,
  ) {
    const asset = input.currency.toUpperCase();
    const reserveAccount = await tx.reserveAccount.upsert({
      where: { provider_asset_network: { provider: 'flutterwave', asset, network: '' } },
      update: {},
      create: { provider: 'flutterwave', asset, network: '', currency: 'USD' },
    });

    const normalizedUsd = new Prisma.Decimal(input.usdAmount);
    if (normalizedUsd.lte(0)) {
      throw new BadRequestException('A confirmed provider payment must have a positive amount');
    }

    return tx.reserveTransaction.upsert({
      where: { idempotencyKey: `flutterwave:deposit:${input.depositId}` },
      update: {},
      create: {
        reserveAccountId: reserveAccount.id,
        type: ReserveTransactionType.PAYMENT_FUNDING,
        status: ReserveTransactionStatus.ELIGIBLE,
        direction: ReserveDirection.CREDIT,
        amount: normalizedUsd,
        eligibleUsdAmount: normalizedUsd,
        normalizationRate: new Prisma.Decimal(1),
        providerReference: input.flutterwaveTxId,
        sourceReference: input.depositId,
        idempotencyKey: `flutterwave:deposit:${input.depositId}`,
        reason: 'Signature-verified Flutterwave payment',
        metadata: {
          flutterwaveTxId: input.flutterwaveTxId,
          txRef: input.txRef,
          currency: input.currency,
        },
        settledAt: new Date(),
      },
    });
  }

  async getCurrentPublishedValue(): Promise<number> {
    const latest = await this.prisma.valuationSnapshot.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { publishedValueUsd: true },
    });
    return latest?.publishedValueUsd.toNumber() ?? this.platformSettings.getTokenUsdRate();
  }

  async getStatus() {
    const [policy, balanceSnapshots, accounts, latest] = await Promise.all([
      this.ensurePolicy(),
      this.prisma.reserveBalanceSnapshot.findMany({ orderBy: { fetchedAt: 'asc' } }),
      this.prisma.tokenAccount.findMany({
        select: { kind: true, available: true, locked: true },
      }),
      this.prisma.valuationSnapshot.findFirst({ orderBy: { createdAt: 'desc' } }),
    ]);
    const supply = summarizeSupply(accounts);
    // The reserve total is the live Flutterwave + NOWPayments account
    // balance sum (reserve-balance-poll.ts, cached in ReserveBalanceSnapshot
    // -- see its doc comment in schema.prisma), not the ReserveTransaction
    // ledger. A provider outage simply leaves its row stale rather than
    // missing, so this always reflects the last successfully polled balance
    // per provider/currency -- that staleness is surfaced via
    // reserveBalancesFetchedAt below, not hidden.
    const eligibleReserveUsd = balanceSnapshots.reduce(
      (total, row) => total + row.balanceUsd.toNumber(),
      0,
    );
    const publishedValueUsd =
      latest?.publishedValueUsd.toNumber() ?? (await this.platformSettings.getTokenUsdRate());
    const redeemableLiabilityUsd = supply.redeemable * publishedValueUsd;
    const coverageRatio =
      redeemableLiabilityUsd > 0 ? eligibleReserveUsd / redeemableLiabilityUsd : null;
    return {
      baseCurrency: policy.baseCurrency,
      enabled: policy.enabled,
      mintingPaused: policy.mintingPaused,
      eligibleReserveUsd,
      publishedValueUsd,
      pinnedValueUsd: policy.pinnedValueUsd?.toNumber() ?? null,
      rawValueUsd: latest?.rawValueUsd.toNumber() ?? null,
      coverageRatio,
      reserveHealthStatus: deriveHealthStatus(coverageRatio, policy),
      supply,
      lastValuationAt: latest?.createdAt ?? null,
      reserveBalances: balanceSnapshots.map((row) => ({
        provider: row.provider,
        currency: row.currency,
        balanceRaw: row.balanceRaw.toString(),
        balanceUsd: row.balanceUsd.toString(),
        fetchedAt: row.fetchedAt,
      })),
      reserveBalancesFetchedAt: balanceSnapshots[0]?.fetchedAt ?? null,
    };
  }

  async recalculateValuation() {
    const [policy, status, previous] = await Promise.all([
      this.ensurePolicy(),
      this.getStatus(),
      this.prisma.valuationSnapshot.findFirst({ orderBy: { createdAt: 'desc' } }),
    ]);
    const fallback = await this.platformSettings.getTokenUsdRate();
    const rawValueUsd =
      status.supply.redeemable > 0
        ? status.eligibleReserveUsd / status.supply.redeemable
        : fallback;
    // A pinned value bypasses the calculated/clamped rate entirely --
    // rawValueUsd above still records what the real calculated value would
    // have been, so drift stays visible once an admin unpins. previous is
    // still read (for previousPublishedValue) so the clamp bounds resume
    // seamlessly from wherever the pin left off, not from a stale
    // pre-pin value.
    const previousPublishedValue = previous?.publishedValueUsd.toNumber() ?? fallback;
    let publishedValueUsd: number;
    if (policy.pinnedValueUsd !== null) {
      publishedValueUsd = policy.pinnedValueUsd.toNumber();
    } else {
      const upper = previousPublishedValue * (1 + policy.maxIncreaseRate.toNumber());
      const lower = previousPublishedValue * Math.max(0, 1 - policy.maxDecreaseRate.toNumber());
      publishedValueUsd = Math.min(upper, Math.max(lower, rawValueUsd));
    }
    const liability = status.supply.redeemable * publishedValueUsd;

    return this.prisma.valuationSnapshot.create({
      data: {
        eligibleReserveUsd: status.eligibleReserveUsd,
        redeemableSupply: status.supply.redeemable,
        totalMinted: status.supply.totalMinted,
        circulatingSupply: status.supply.circulating,
        treasurySupply: status.supply.treasury,
        lockedSupply: status.supply.locked,
        burnedSupply: status.supply.burned,
        rawValueUsd,
        previousPublishedValue,
        publishedValueUsd,
        coverageRatio: liability > 0 ? status.eligibleReserveUsd / liability : null,
        policyVersion: policy.updatedAt.toISOString(),
      },
    });
  }

  async getValuationHistory(params: { limit?: number; before?: Date }) {
    const limit = Math.min(params.limit ?? 90, 365);
    return this.prisma.valuationSnapshot.findMany({
      where: params.before ? { createdAt: { lt: params.before } } : undefined,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async isEnabled(): Promise<boolean> {
    const policy = await this.ensurePolicy();
    return policy.enabled;
  }

  /** Used by manual-settlement callers (admin force-settle) that mint outside settlement-job's own run -- same policy read settlement-job duplicates for the same purpose. */
  async isMintingPaused(): Promise<boolean> {
    const policy = await this.ensurePolicy();
    return policy.mintingPaused;
  }

  async setMintingPaused(paused: boolean) {
    return this.prisma.tokenomicsPolicy.update({
      where: { id: 'default' },
      data: { mintingPaused: paused },
    });
  }

  async ensureUserAccount(userId: string) {
    return this.prisma.$transaction((tx) => this.ensureUserAccountTx(tx, userId));
  }

  async ensureUserAccountTx(tx: Prisma.TransactionClient, userId: string) {
    return tx.tokenAccount.upsert({
      where: { userId },
      update: {},
      create: { code: `user:${userId}`, kind: TokenAccountKind.USER, userId },
    });
  }

  /** Resolves the singleton treasury/burn system accounts, creating on first use. */
  async ensureSystemAccountTx(tx: Prisma.TransactionClient, kind: 'TREASURY' | 'BURN') {
    const code = kind === 'TREASURY' ? 'treasury' : 'burn';
    return tx.tokenAccount.upsert({
      where: { code },
      update: {},
      create: { code, kind: TokenAccountKind[kind] },
    });
  }

  async lock(userId: string, input: LockUnlockInput) {
    return this.prisma.$transaction((tx) => this.lockTx(tx, userId, input));
  }

  async lockTx(tx: Prisma.TransactionClient, userId: string, input: LockUnlockInput) {
    const account = await this.ensureUserAccountTx(tx, userId);
    const amount = new Prisma.Decimal(input.amount);
    if (amount.lte(0)) throw new BadRequestException('Lock amount must be positive');
    if (account.available.lt(amount)) {
      throw new BadRequestException('Insufficient available balance to lock');
    }

    const operation = await tx.tokenOperation.upsert({
      where: { idempotencyKey: input.idempotencyKey },
      update: {},
      create: {
        type: TokenOperationType.LOCK,
        status: TokenOperationStatus.SETTLED,
        idempotencyKey: input.idempotencyKey,
        reference: input.reference ?? null,
        reason: input.reason ?? null,
        settledAt: new Date(),
      },
    });
    // Idempotent re-post guard: a retried request with the same idempotencyKey
    // upserts the same TokenOperation and skips re-applying the balance delta
    // if this account's ledger entry already exists for it.
    const existingEntry = await tx.tokenLedgerEntry.findUnique({
      where: { accountId_operationId: { accountId: account.id, operationId: operation.id } },
    });
    if (existingEntry) {
      return tx.tokenAccount.findUniqueOrThrow({ where: { id: account.id } });
    }
    await tx.tokenLedgerEntry.create({
      data: {
        accountId: account.id,
        operationId: operation.id,
        availableDelta: amount.neg(),
        lockedDelta: amount,
      },
    });
    return tx.tokenAccount.update({
      where: { id: account.id },
      data: { available: { decrement: amount }, locked: { increment: amount } },
    });
  }

  async unlock(userId: string, input: LockUnlockInput) {
    return this.prisma.$transaction((tx) => this.unlockTx(tx, userId, input));
  }

  async unlockTx(tx: Prisma.TransactionClient, userId: string, input: LockUnlockInput) {
    const account = await this.ensureUserAccountTx(tx, userId);
    const amount = new Prisma.Decimal(input.amount);
    if (amount.lte(0)) throw new BadRequestException('Unlock amount must be positive');
    if (account.locked.lt(amount)) {
      throw new BadRequestException('Insufficient locked balance to unlock');
    }

    const operation = await tx.tokenOperation.upsert({
      where: { idempotencyKey: input.idempotencyKey },
      update: {},
      create: {
        type: TokenOperationType.UNLOCK,
        status: TokenOperationStatus.SETTLED,
        idempotencyKey: input.idempotencyKey,
        reference: input.reference ?? null,
        reason: input.reason ?? null,
        settledAt: new Date(),
      },
    });
    const existingEntry = await tx.tokenLedgerEntry.findUnique({
      where: { accountId_operationId: { accountId: account.id, operationId: operation.id } },
    });
    if (existingEntry) {
      return tx.tokenAccount.findUniqueOrThrow({ where: { id: account.id } });
    }
    await tx.tokenLedgerEntry.create({
      data: {
        accountId: account.id,
        operationId: operation.id,
        availableDelta: amount,
        lockedDelta: amount.neg(),
      },
    });
    return tx.tokenAccount.update({
      where: { id: account.id },
      data: { available: { increment: amount }, locked: { decrement: amount } },
    });
  }

  async burn(accountCode: string, input: BurnInput) {
    return this.prisma.$transaction((tx) => this.burnTx(tx, accountCode, input));
  }

  /**
   * Double-entry burn: funds move from the source account into the BURN
   * system account rather than vanishing, so summarizeSupply()'s existing
   * "BURN kind account's available+locked = burned supply" accounting needs
   * no changes.
   */
  async burnTx(tx: Prisma.TransactionClient, accountCode: string, input: BurnInput) {
    const source = await tx.tokenAccount.findUnique({ where: { code: accountCode } });
    if (!source) throw new BadRequestException(`Unknown token account: ${accountCode}`);
    const amount = new Prisma.Decimal(input.amount);
    if (amount.lte(0)) throw new BadRequestException('Burn amount must be positive');
    if (source.available.lt(amount)) {
      throw new BadRequestException('Insufficient available balance to burn');
    }

    const burnAccount = await this.ensureSystemAccountTx(tx, 'BURN');
    const operation = await tx.tokenOperation.upsert({
      where: { idempotencyKey: input.idempotencyKey },
      update: {},
      create: {
        type: TokenOperationType.BURN,
        status: TokenOperationStatus.SETTLED,
        idempotencyKey: input.idempotencyKey,
        reference: accountCode,
        reason: input.reason ?? null,
        settledAt: new Date(),
      },
    });
    const existingEntry = await tx.tokenLedgerEntry.findUnique({
      where: { accountId_operationId: { accountId: source.id, operationId: operation.id } },
    });
    if (existingEntry) {
      return tx.tokenAccount.findUniqueOrThrow({ where: { id: source.id } });
    }
    await tx.tokenLedgerEntry.createMany({
      data: [
        { accountId: source.id, operationId: operation.id, availableDelta: amount.neg() },
        { accountId: burnAccount.id, operationId: operation.id, availableDelta: amount },
      ],
    });
    await tx.tokenAccount.update({
      where: { id: burnAccount.id },
      data: { available: { increment: amount } },
    });
    return tx.tokenAccount.update({
      where: { id: source.id },
      data: { available: { decrement: amount } },
    });
  }

  async listReserveTransactions(query: ListReserveTransactionsDto) {
    const where: Prisma.ReserveTransactionWhereInput = {
      type: query.type,
      status: query.status,
      direction: query.direction,
    };
    const skip = (query.page - 1) * query.pageSize;
    const [items, total] = await Promise.all([
      this.prisma.reserveTransaction.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take: query.pageSize,
        include: {
          reserveAccount: {
            select: { provider: true, asset: true, network: true, currency: true },
          },
        },
      }),
      this.prisma.reserveTransaction.count({ where }),
    ]);
    return {
      items,
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  async listTokenOperations(query: ListTokenOperationsDto) {
    const where: Prisma.TokenOperationWhereInput = { type: query.type, status: query.status };
    const skip = (query.page - 1) * query.pageSize;
    const [items, total] = await Promise.all([
      this.prisma.tokenOperation.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take: query.pageSize,
        include: { entries: { include: { account: { select: { code: true, kind: true } } } } },
      }),
      this.prisma.tokenOperation.count({ where }),
    ]);
    return {
      items,
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  async getPolicy() {
    return this.ensurePolicy();
  }

  async updatePolicy(input: UpdateTokenomicsPolicyDto) {
    const current = await this.ensurePolicy();
    const merged = {
      healthyCoverageThreshold:
        input.healthyCoverageThreshold ?? current.healthyCoverageThreshold.toNumber(),
      watchCoverageThreshold:
        input.watchCoverageThreshold ?? current.watchCoverageThreshold.toNumber(),
      restrictedCoverageThreshold:
        input.restrictedCoverageThreshold ?? current.restrictedCoverageThreshold.toNumber(),
    };
    if (!(
      merged.healthyCoverageThreshold >= merged.watchCoverageThreshold &&
      merged.watchCoverageThreshold >= merged.restrictedCoverageThreshold
    )) {
      throw new BadRequestException(
        'Coverage thresholds must satisfy healthy >= watch >= restricted',
      );
    }
    return this.prisma.tokenomicsPolicy.update({
      where: { id: 'default' },
      data: {
        valuationIntervalMinutes: input.valuationIntervalMinutes,
        maxIncreaseRate: input.maxIncreaseRate,
        maxDecreaseRate: input.maxDecreaseRate,
        healthyCoverageThreshold: input.healthyCoverageThreshold,
        watchCoverageThreshold: input.watchCoverageThreshold,
        restrictedCoverageThreshold: input.restrictedCoverageThreshold,
      },
    });
  }

  /**
   * Pins the DL/USD rate to an admin-set value, bypassing the reserve/
   * supply-derived calculation everywhere publishedValueUsd is read.
   * Immediately triggers recalculateValuation so the pin takes effect right
   * away rather than waiting for the next scheduled cycle.
   */
  async pinValue(value: number) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new BadRequestException('Pinned value must be a positive number');
    }
    await this.prisma.tokenomicsPolicy.update({
      where: { id: 'default' },
      data: { pinnedValueUsd: value },
    });
    return this.recalculateValuation();
  }

  /** Reverts to the calculated rate; immediately triggers recalculateValuation so unpinning takes effect right away. */
  async unpinValue() {
    await this.prisma.tokenomicsPolicy.update({
      where: { id: 'default' },
      data: { pinnedValueUsd: null },
    });
    return this.recalculateValuation();
  }

  async ensurePolicy() {
    return this.prisma.tokenomicsPolicy.upsert({
      where: { id: 'default' },
      update: {},
      create: { id: 'default', baseCurrency: 'USD' },
    });
  }
}

function summarizeSupply(
  accounts: Array<{ kind: TokenAccountKind; available: Prisma.Decimal; locked: Prisma.Decimal }>,
) {
  let circulating = 0;
  let treasury = 0;
  let locked = 0;
  let burned = 0;
  for (const account of accounts) {
    const available = account.available.toNumber();
    const accountLocked = account.locked.toNumber();
    if (account.kind === TokenAccountKind.USER) {
      circulating += available;
      locked += accountLocked;
    } else if (account.kind === TokenAccountKind.TREASURY) {
      treasury += available + accountLocked;
    } else {
      burned += available + accountLocked;
    }
  }
  return {
    totalMinted: circulating + treasury + locked + burned,
    circulating,
    treasury,
    locked,
    burned,
    redeemable: circulating + locked,
  };
}

/**
 * CRITICAL is derived as "below restrictedCoverageThreshold" rather than a
 * separate configured threshold -- a fourth independent value risks drifting
 * out of sync with restrictedCoverageThreshold (e.g. an admin raising
 * restrictedCoverageThreshold above a stale criticalCoverageThreshold).
 */
function deriveHealthStatus(
  coverageRatio: number | null,
  policy: TokenomicsPolicy,
): ReserveHealthStatus {
  if (coverageRatio === null) return 'HEALTHY';
  const healthy = policy.healthyCoverageThreshold.toNumber();
  const watch = policy.watchCoverageThreshold.toNumber();
  const restricted = policy.restrictedCoverageThreshold.toNumber();
  if (coverageRatio >= healthy) return 'HEALTHY';
  if (coverageRatio >= watch) return 'WATCH';
  if (coverageRatio >= restricted) return 'RESTRICTED';
  return 'CRITICAL';
}

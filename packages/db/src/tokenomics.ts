import { Prisma, type PrismaClient } from './generated/prisma/client';

const { Decimal } = Prisma;
type Decimal = Prisma.Decimal;

/**
 * Mints a training payout into the Tokenomics engine's TokenAccount ledger,
 * parallel to (and always called alongside) payouts.ts's
 * creditTrainingPayoutOps, which credits the legacy Wallet.balance that
 * actually pays trainers. This does not replace that legacy credit -- it
 * makes the same real payout visible to TokenAccount/TokenOperation so the
 * admin Tokenomics dashboard's supply/coverage figures reflect real token
 * issuance instead of staying at zero. Idempotency mirrors
 * TokenomicsService.lockTx/unlockTx/burnTx: the operation is upserted by
 * idempotencyKey and the balance delta is skipped if this account's ledger
 * entry already exists for it, so a retried settlement row can't double-mint.
 */
export async function mintTrainingPayoutOps(
  prisma: PrismaClient,
  userId: string,
  tokenAmount: Decimal | number | string,
  reference: string,
) {
  const amount = new Decimal(tokenAmount);
  if (amount.lte(0)) {
    return { ops: [] as Prisma.PrismaPromise<unknown>[] };
  }

  const account = await prisma.tokenAccount.upsert({
    where: { userId },
    update: {},
    create: { code: `user:${userId}`, kind: 'USER', userId },
  });

  const idempotencyKey = `mint:training-payout:${reference}`;
  const existingOperation = await prisma.tokenOperation.findUnique({
    where: { idempotencyKey },
    select: { id: true },
  });
  if (existingOperation) {
    const existingEntry = await prisma.tokenLedgerEntry.findUnique({
      where: { accountId_operationId: { accountId: account.id, operationId: existingOperation.id } },
    });
    if (existingEntry) {
      return { ops: [] as Prisma.PrismaPromise<unknown>[] };
    }
  }

  // Executed eagerly (not bundled into the returned ops) so the ledger
  // entry/account-update ops below can reference a real operationId --
  // mirrors buildCreditTrainingPayoutOps's own pattern of resolving
  // wallet/user/settings rows before building its returned ops array.
  // Safe outside the caller's settlement transaction: it's keyed by the same
  // idempotencyKey the caller's transaction will upsert again down below, so
  // a crash between this and the caller's transaction just means the next
  // retry finds the operation already created and reuses it.
  const operation = await prisma.tokenOperation.upsert({
    where: { idempotencyKey },
    update: {},
    create: {
      type: 'MINT',
      status: 'SETTLED',
      idempotencyKey,
      reference,
      reason: 'Training payout settlement',
      settledAt: new Date(),
    },
  });

  const ops: Prisma.PrismaPromise<unknown>[] = [
    prisma.tokenLedgerEntry.create({
      data: {
        accountId: account.id,
        operationId: operation.id,
        availableDelta: amount,
      },
    }),
    prisma.tokenAccount.update({
      where: { id: account.id },
      data: { available: { increment: amount } },
    }),
  ];

  return { ops };
}

/**
 * Debits the reserve ledger for a completed fiat payout (Flutterwave
 * transfer that settled), the missing counterpart to
 * TokenomicsService.recordConfirmedFlutterwaveDepositTx (which only credits
 * the reserve on funding). Without this, eligibleReserveUsd only ever grows
 * and Reserve Coverage drifts increasingly optimistic as real payouts occur.
 * Idempotent on withdrawalId via the same idempotencyKey-upsert pattern as
 * the funding-credit path, so a retried/reconciled status update can't
 * double-debit.
 */
export async function debitReserveForFlutterwavePayoutOps(
  prisma: PrismaClient,
  params: {
    withdrawalId: string;
    providerPayoutId: string;
    currency: string;
    fiatAmount: Decimal | number | string;
    usdAmount: Decimal | number | string;
  },
) {
  const amount = new Decimal(params.fiatAmount);
  const normalizedUsd = new Decimal(params.usdAmount);
  if (amount.lte(0) || normalizedUsd.lte(0)) {
    return { ops: [] as Prisma.PrismaPromise<unknown>[] };
  }

  const idempotencyKey = `flutterwave:payout:${params.withdrawalId}`;
  const existing = await prisma.reserveTransaction.findUnique({
    where: { idempotencyKey },
    select: { id: true },
  });
  if (existing) {
    return { ops: [] as Prisma.PrismaPromise<unknown>[] };
  }

  // Same key shape as TokenomicsService.recordConfirmedFlutterwaveDepositTx
  // (provider/asset/network keyed by the payment's own currency, not a fixed
  // USD account) -- this debit must land on the SAME ReserveAccount that
  // funding credited, or the reserve/coverage figures never actually net
  // against each other.
  const asset = params.currency.toUpperCase();
  const reserveAccount = await prisma.reserveAccount.upsert({
    where: { provider_asset_network: { provider: 'flutterwave', asset, network: '' } },
    update: {},
    create: { provider: 'flutterwave', asset, network: '', currency: 'USD' },
  });

  const ops: Prisma.PrismaPromise<unknown>[] = [
    prisma.reserveTransaction.create({
      data: {
        reserveAccountId: reserveAccount.id,
        type: 'REDEMPTION',
        status: 'ELIGIBLE',
        direction: 'DEBIT',
        amount,
        eligibleUsdAmount: normalizedUsd,
        normalizationRate: normalizedUsd.div(amount),
        providerReference: params.providerPayoutId,
        sourceReference: params.withdrawalId,
        idempotencyKey,
        reason: 'Settled Flutterwave payout',
        settledAt: new Date(),
      },
    }),
  ];

  return { ops };
}

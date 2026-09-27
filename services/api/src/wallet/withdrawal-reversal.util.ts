import { Prisma } from '@dialectiva/db';

/** The parts of a WithdrawalRequest a reversal needs. */
export interface ReversibleWithdrawal {
  id: string;
  walletId: string;
  tokenAmount: Prisma.Decimal;
  /**
   * How much of tokenAmount came from Wallet.royaltyBalance.
   *
   * Optional so a caller that selected a narrower row, or any code path holding
   * a withdrawal shaped before this column existed, still reverses correctly
   * instead of throwing on a money endpoint. Absent is treated as 0 -- which is
   * the truth for every withdrawal that predates royalties.
   */
  royaltyFundedAmount?: Prisma.Decimal | null;
}

/** One ledger row plus the wallet increment it backs. */
export interface ReversalWrite {
  type: 'WITHDRAWAL_REVERSED' | 'ROYALTY_WITHDRAWAL_REVERSED';
  amount: Prisma.Decimal;
  /** Which wallet column this portion returns to. */
  column: 'balance' | 'royaltyBalance';
}

/**
 * Where a rejected withdrawal's DL goes back to.
 *
 * THE fix for docs/Stream-Revenue-Sharing-Engine.md 6.1(a), which calls this
 * the single most important correctness item in the design. Both reversal
 * sites -- the admin reject in wallet.controller.ts and the auto-reject when an
 * account is locked in auth.service.ts -- previously credited `balance`
 * unconditionally. Once royalty withdrawals exist, that path returns
 * withdraw-only royalty DL as SPENDABLE balance, making it P2P-tradeable and
 * stakeable through the back door and defeating the entire separation the
 * separate column exists to create.
 *
 * Routing by the funding split recorded on the request is what closes it. The
 * split is persisted at request time rather than inferred at rejection time,
 * because by then the balances have moved and there is nothing left to infer
 * from.
 *
 * Returns one write per funding source. An ordinary withdrawal (every row that
 * exists today, royaltyFundedAmount 0) produces exactly the single
 * WITHDRAWAL_REVERSED write it always did, so this is a no-op for existing
 * behaviour -- deliberately, since it runs on a live money path.
 *
 * A mixed-funding request would produce two writes, and this handles it
 * correctly, but section 8 forbids creating one: spending across both columns
 * cannot be expressed as a single atomic updateMany guard. The arithmetic here
 * is defensive, not an invitation.
 */
export function planWithdrawalReversal(withdrawal: ReversibleWithdrawal): ReversalWrite[] {
  const total = withdrawal.tokenAmount;
  // Clamped to [0, total]. A stored split wider than the request would
  // otherwise credit more than was ever debited.
  const royaltyPortion = clamp(withdrawal.royaltyFundedAmount ?? new Prisma.Decimal(0), total);
  const ordinaryPortion = total.minus(royaltyPortion);

  const writes: ReversalWrite[] = [];
  if (ordinaryPortion.greaterThan(0)) {
    writes.push({
      type: 'WITHDRAWAL_REVERSED',
      amount: ordinaryPortion,
      column: 'balance',
    });
  }
  if (royaltyPortion.greaterThan(0)) {
    writes.push({
      type: 'ROYALTY_WITHDRAWAL_REVERSED',
      amount: royaltyPortion,
      column: 'royaltyBalance',
    });
  }
  // A zero-amount request produces no write at all rather than a zero ledger
  // row: the unique constraint on (walletId, type, reference) means a no-op row
  // would still block a later legitimate reversal of the same request.
  return writes;
}

function clamp(value: Prisma.Decimal, max: Prisma.Decimal): Prisma.Decimal {
  if (value.lessThan(0)) return new Prisma.Decimal(0);
  if (value.greaterThan(max)) return max;
  return value;
}

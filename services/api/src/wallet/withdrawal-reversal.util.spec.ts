import { Prisma } from '@dialectiva/db';
import { planWithdrawalReversal } from './withdrawal-reversal.util';

/**
 * The laundering guard. Section 6.1(a) of the revenue-sharing design calls this
 * the single most important correctness item in it: a rejected royalty
 * withdrawal must restore royaltyBalance and leave balance untouched, or
 * withdraw-only earnings become P2P-tradeable through the reversal path.
 */
function withdrawal(tokenAmount: string, royaltyFundedAmount = '0') {
  return {
    id: 'wd-1',
    walletId: 'wallet-1',
    tokenAmount: new Prisma.Decimal(tokenAmount),
    royaltyFundedAmount: new Prisma.Decimal(royaltyFundedAmount),
  };
}

describe('planWithdrawalReversal', () => {
  it('returns a royalty-funded withdrawal to royaltyBalance, never to balance', async () => {
    // THE test 6.1(a) demands. Crediting `balance` here is the hole.
    const writes = planWithdrawalReversal(withdrawal('100', '100'));

    expect(writes).toHaveLength(1);
    expect(writes[0].column).toBe('royaltyBalance');
    expect(writes[0].type).toBe('ROYALTY_WITHDRAWAL_REVERSED');
    expect(writes[0].amount.toString()).toBe('100');
    expect(writes.some((w) => w.column === 'balance')).toBe(false);
  });

  it('leaves an ordinary withdrawal on exactly the path it always took', () => {
    // Every row that exists today has royaltyFundedAmount 0. This runs on a
    // live money path, so the existing behaviour must be bit-identical.
    const writes = planWithdrawalReversal(withdrawal('50'));

    expect(writes).toEqual([
      {
        type: 'WITHDRAWAL_REVERSED',
        amount: new Prisma.Decimal('50'),
        column: 'balance',
      },
    ]);
  });

  it('never credits more than was debited', () => {
    // A stored split wider than the request would mint DL out of a rejection.
    const writes = planWithdrawalReversal(withdrawal('40', '999'));

    expect(total(writes).toString()).toBe('40');
    expect(writes.every((w) => w.column === 'royaltyBalance')).toBe(true);
  });

  it('never credits less than was debited', () => {
    // The mirror failure: silently swallowing part of a rejected withdrawal.
    const writes = planWithdrawalReversal(withdrawal('75', '25'));

    expect(total(writes).toString()).toBe('75');
  });

  it('splits a mixed-funding request across both columns', () => {
    // Section 8 forbids CREATING one, but the arithmetic must be right rather
    // than silently dumping the whole amount in one column.
    const writes = planWithdrawalReversal(withdrawal('100', '30'));

    const byColumn = new Map(writes.map((w) => [w.column, w.amount.toString()]));
    expect(byColumn.get('balance')).toBe('70');
    expect(byColumn.get('royaltyBalance')).toBe('30');
  });

  it('treats a negative stored split as zero rather than debiting on a reversal', () => {
    const writes = planWithdrawalReversal(withdrawal('60', '-10'));

    expect(writes).toHaveLength(1);
    expect(writes[0].column).toBe('balance');
    expect(writes[0].amount.toString()).toBe('60');
  });

  it('treats an absent split as zero rather than throwing on a money endpoint', () => {
    // Any row shaped before this column existed, or a caller selecting a
    // narrower row, must still reverse correctly -- crashing a withdrawal
    // rejection is worse than the bug this helper fixes.
    const writes = planWithdrawalReversal({
      id: 'wd-legacy',
      walletId: 'wallet-1',
      tokenAmount: new Prisma.Decimal('20'),
    });

    expect(writes).toEqual([
      {
        type: 'WITHDRAWAL_REVERSED',
        amount: new Prisma.Decimal('20'),
        column: 'balance',
      },
    ]);
  });

  it('emits no write for a zero-amount request', () => {
    // A zero ledger row would consume the unique (walletId, type, reference)
    // slot and block a later legitimate reversal of the same request.
    expect(planWithdrawalReversal(withdrawal('0'))).toEqual([]);
  });

  it('preserves fractional DL exactly', () => {
    const writes = planWithdrawalReversal(withdrawal('0.00000003', '0.00000001'));

    expect(total(writes).toString()).toBe('3e-8');
    const byColumn = new Map(writes.map((w) => [w.column, w.amount.toString()]));
    expect(byColumn.get('royaltyBalance')).toBe('1e-8');
    expect(byColumn.get('balance')).toBe('2e-8');
  });
});

function total(writes: { amount: Prisma.Decimal }[]): Prisma.Decimal {
  return writes.reduce((sum, w) => sum.plus(w.amount), new Prisma.Decimal(0));
}

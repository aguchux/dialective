import {
  fiatWithdrawalContextHash,
  royaltyWithdrawalContextHash,
  withdrawalContextHash,
} from './otp-context.util';

/**
 * A step-up code is bound to what it authorises. These tests pin the binding
 * that matters most once two balance columns exist: a code issued to move
 * ordinary DL must not authorise moving royalty DL.
 */
describe('royaltyWithdrawalContextHash', () => {
  it('differs from the ordinary fiat hash for identical inputs', () => {
    // THE separation. The fields are the same, so without the `kind`
    // discriminator the two hashes would collide and a code issued on one rail
    // would satisfy the other -- letting a step-up for a spendable-balance
    // payout authorise a spend from the withdraw-only one.
    const input = { tokenAmount: 600, payoutAccountId: 'pa-1' };

    expect(royaltyWithdrawalContextHash(input)).not.toBe(fiatWithdrawalContextHash(input));
  });

  it('binds to the amount', () => {
    expect(
      royaltyWithdrawalContextHash({ tokenAmount: 600, payoutAccountId: 'pa-1' }),
    ).not.toBe(royaltyWithdrawalContextHash({ tokenAmount: 601, payoutAccountId: 'pa-1' }));
  });

  it('binds to the destination', () => {
    expect(
      royaltyWithdrawalContextHash({ tokenAmount: 600, payoutAccountId: 'pa-1' }),
    ).not.toBe(royaltyWithdrawalContextHash({ tokenAmount: 600, payoutAccountId: 'pa-2' }));
  });

  it('is stable for the same request, so the two routes agree', () => {
    // The issuing route and the executing route both compute this. If it were
    // not deterministic, every payout would fail verification.
    const input = { tokenAmount: 600, payoutAccountId: 'pa-1' };

    expect(royaltyWithdrawalContextHash(input)).toBe(royaltyWithdrawalContextHash(input));
  });

  it('differs from the crypto withdrawal hash too', () => {
    expect(
      royaltyWithdrawalContextHash({ tokenAmount: 600, payoutAccountId: 'pa-1' }),
    ).not.toBe(
      withdrawalContextHash({
        tokenAmount: 600,
        destinationAddress: 'pa-1',
        destinationCurrency: 'USDT',
        destinationNetwork: 'TRC20',
      }),
    );
  });
});

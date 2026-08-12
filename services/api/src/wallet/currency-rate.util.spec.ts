import { tokensToLocalCurrency } from './currency-rate.util';

describe('tokensToLocalCurrency', () => {
  it('chains the token->USD peg and USD->local currency rate', () => {
    // 100 tokens * $0.10/token = $10, * 1500 NGN/USD = 15000 NGN
    expect(tokensToLocalCurrency(100, 0.1, 1500)).toBeCloseTo(15000, 5);
  });

  it('returns the USD-equivalent value when the exchange rate is 1 (USD itself)', () => {
    expect(tokensToLocalCurrency(50, 0.1, 1)).toBeCloseTo(5, 5);
  });

  it('returns 0 for a zero token amount', () => {
    expect(tokensToLocalCurrency(0, 0.1, 1500)).toBe(0);
  });
});

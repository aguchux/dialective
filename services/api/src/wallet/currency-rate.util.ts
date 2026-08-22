import { tokensToUsdt } from './token-rate.util';

/**
 * Display-layer conversion only: Token->USD stays the fixed peg
 * (token-rate.util.ts), USD->local currency is the floating market rate
 * cached on Country.usdExchangeRate (fx-rate-job). Never used for
 * deposit/withdrawal accounting, which stays USD-denominated.
 */
export function tokensToLocalCurrency(
  tokenAmount: number,
  tokenUsdRate: number,
  usdExchangeRate: number,
): number {
  return tokensToUsdt(tokenAmount, tokenUsdRate) * usdExchangeRate;
}

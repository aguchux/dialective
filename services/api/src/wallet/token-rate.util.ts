/**
 * Fixed token/USD peg (business plan §5: "Token = internal unit
 * representing $X of platform value... pegged, not floating"). Read
 * directly from env rather than cached at module init, since NestJS
 * providers in this repo are otherwise stateless per-request -- the env var
 * itself is the source of truth and doesn't change at runtime.
 */
export function getTokenUsdRate(): number {
  const raw = process.env.TOKEN_USD_RATE ?? '0.10';
  const rate = Number(raw);
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error(`Invalid TOKEN_USD_RATE: ${raw}`);
  }
  return rate;
}

export function getMinWithdrawalTokens(): number {
  const raw = process.env.MIN_WITHDRAWAL_TOKENS ?? '50';
  const min = Number(raw);
  if (!Number.isFinite(min) || min < 0) {
    throw new Error(`Invalid MIN_WITHDRAWAL_TOKENS: ${raw}`);
  }
  return min;
}

export function usdToTokens(usdAmount: number, rate: number): number {
  return usdAmount / rate;
}

export function tokensToUsdt(tokenAmount: number, rate: number): number {
  return tokenAmount * rate;
}

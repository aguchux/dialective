/**
 * Fixed token/USD peg (business plan §5: "Token = internal unit
 * representing $X of platform value... pegged, not floating"). The rate
 * itself is resolved by PlatformSettingsService (DB override with an
 * env-var fallback) -- these are the pure conversion functions only.
 */
export function usdToTokens(usdAmount: number, rate: number): number {
  return usdAmount / rate;
}

export function tokensToUsdt(tokenAmount: number, rate: number): number {
  return tokenAmount * rate;
}

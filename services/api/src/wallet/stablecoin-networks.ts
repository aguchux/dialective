/**
 * Every (asset, network) pair we let a trainer set up a payout wallet for,
 * mapped to NOWPayments' own currency code for that pair -- confirmed live
 * against GET /v1/full-currencies on 2026-09-09, all `available_for_payout:
 * true` for this merchant account. Not every network supports every asset:
 * NOWPayments has no USDC-on-Tron listing at all (USDC only exists on
 * eth/bsc/sol/matic for this account), so TRC20 is USDT-only here -- this
 * table is the single source of truth for that constraint instead of
 * letting each caller assume all combinations are valid.
 */
export const STABLECOIN_NETWORKS = ['TRC20', 'ERC20', 'BEP20', 'SOL', 'POLYGON'] as const;
export type StablecoinNetwork = (typeof STABLECOIN_NETWORKS)[number];

export const STABLECOIN_ASSETS = ['USDT', 'USDC'] as const;
export type StablecoinAsset = (typeof STABLECOIN_ASSETS)[number];

const NOWPAYMENTS_CURRENCY_CODES: Record<
  StablecoinAsset,
  Partial<Record<StablecoinNetwork, string>>
> = {
  USDT: {
    TRC20: 'usdttrc20',
    ERC20: 'usdterc20',
    BEP20: 'usdtbsc',
    SOL: 'usdtsol',
    POLYGON: 'usdtmatic',
  },
  USDC: {
    // NOWPayments lists plain USDC as the Ethereum/ERC20 variant -- there is
    // no separate 'usdcerc20' code, and no TRC20 listing for USDC at all.
    ERC20: 'usdc',
    BEP20: 'usdcbsc',
    SOL: 'usdcsol',
    POLYGON: 'usdcmatic',
  },
};

export function isValidStablecoinPair(asset: string, network: string): boolean {
  return Boolean(
    NOWPAYMENTS_CURRENCY_CODES[asset as StablecoinAsset]?.[network as StablecoinNetwork],
  );
}

export function getNowPaymentsCurrencyCode(
  asset: StablecoinAsset,
  network: StablecoinNetwork,
): string {
  const code = NOWPAYMENTS_CURRENCY_CODES[asset]?.[network];
  if (!code) {
    throw new Error(`No NOWPayments currency code for ${asset} on ${network}`);
  }
  return code;
}

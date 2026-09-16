import { Logger } from '@nestjs/common';

const FX_API_URL = process.env.FX_API_URL ?? 'https://open.er-api.com/v6/latest/USD';

interface FxRatesResponse {
  result: string;
  rates: Record<string, number>;
}

/** Same parse contract as fx-rate-job's FX API client -- keep both in sync if the upstream shape changes. */
function parseFxRates(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== 'object') throw new Error('FX API response was not an object');
  const body = raw as Partial<FxRatesResponse>;
  if (body.result !== 'success' || !body.rates || typeof body.rates !== 'object') {
    throw new Error('FX API response missing a successful rates payload');
  }
  return body.rates;
}

/** Raw fetch+parse against the same FX API fx-rate-job uses. Returns null (never throws) on failure. */
export async function fetchAllFxRatesOrNull(logger: Logger): Promise<Record<string, number> | null> {
  try {
    const res = await fetch(FX_API_URL);
    if (!res.ok) throw new Error(`FX API request failed: ${res.status} ${res.statusText}`);
    return parseFxRates(await res.json());
  } catch (err) {
    logger.warn(`FX rate fetch failed: ${(err as Error).message}`);
    return null;
  }
}

/**
 * Best-effort on-demand fetch of a single currency's live USD rate, used by
 * the "reset to live" admin action so a country isn't stuck showing a stale
 * MANUAL-era rate until the next fx-rate-job cron run (up to 24h later).
 * Returns null (never throws) on any failure -- the caller falls back to
 * leaving usdExchangeRate untouched and letting the next scheduled run fix it.
 */
export async function fetchLiveRateOrNull(
  currencyCode: string,
  logger: Logger,
): Promise<number | null> {
  if (currencyCode === 'USD') return 1;
  const rates = await fetchAllFxRatesOrNull(logger);
  if (!rates) return null;
  const rate = rates[currencyCode];
  return typeof rate === 'number' && rate > 0 ? rate : null;
}

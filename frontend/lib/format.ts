const compactUsdFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 2,
});

const usdFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
});

const compactNumberFormatter = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 2,
});

/** e.g. 4682 -> "$4.68K" */
export function formatCompactUsd(value: number | string) {
  return compactUsdFormatter.format(Number(value));
}

/** e.g. 4682 -> "$4,682.00" (no compaction, for exact figures) */
export function formatUsd(value: number | string) {
  return usdFormatter.format(Number(value));
}

/** e.g. 4682 -> "4.68K" */
export function formatCompactNumber(value: number | string) {
  return compactNumberFormatter.format(Number(value));
}

/** e.g. 4682 -> "4.68K DL" -- "DL" ("Dial") is this platform's display name for its token unit, see AGENTS.md "Wallet / token pool" */
export function formatCompactTokens(value: number | string) {
  return `${compactNumberFormatter.format(Number(value))} DL`;
}

const compactCurrencyFormatters = new Map<string, Intl.NumberFormat>();

/** e.g. formatCompactLocalCurrency(15000000, "NGN") -> "₦15M" (falls back to a plain compact number if the currency code isn't recognized) */
export function formatCompactLocalCurrency(value: number | string, currencyCode: string) {
  let formatter = compactCurrencyFormatters.get(currencyCode);
  if (!formatter) {
    try {
      formatter = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currencyCode,
        notation: 'compact',
        maximumFractionDigits: 2,
      });
    } catch {
      formatter = undefined;
    }
    if (formatter) compactCurrencyFormatters.set(currencyCode, formatter);
  }
  if (!formatter) return `${compactNumberFormatter.format(Number(value))} ${currencyCode}`;
  return formatter.format(Number(value));
}

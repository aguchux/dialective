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

/** e.g. "NG" -> "🇳🇬" -- regional indicator symbols are 0x1F1E6 + (letter offset from 'A'), one per ISO 3166-1 alpha-2 letter. Returns null for anything that isn't exactly two A-Z letters, so a missing/malformed code renders nothing instead of a broken glyph. */
export function countryFlagEmoji(isoAlpha2: string | null | undefined): string | null {
  if (!isoAlpha2 || !/^[A-Za-z]{2}$/.test(isoAlpha2)) return null;
  const codePoints = [...isoAlpha2.toUpperCase()].map(
    (letter) => 0x1f1e6 + letter.charCodeAt(0) - 65,
  );
  return String.fromCodePoint(...codePoints);
}

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

const compactTokenFormatter = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 4,
});

/** e.g. 4682 -> "4.68K DL", 0.0025 -> "0.0025 DL" -- "DL" ("Dial") is this platform's display name for its token unit, see AGENTS.md "Wallet / token pool". 4 decimal places (vs. formatCompactNumber's 2) so small fractional balances/payouts don't round away to 0. */
export function formatCompactTokens(value: number | string) {
  return `${compactTokenFormatter.format(Number(value))} DL`;
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

const exactCurrencyFormatters = new Map<string, Intl.NumberFormat>();

/** e.g. formatLocalCurrency(137110, "NGN") -> "₦137,110.00" -- exact (no compaction), for figures a user must confirm before acting on, unlike formatCompactLocalCurrency's at-a-glance summary use. */
export function formatLocalCurrency(value: number | string, currencyCode: string) {
  let formatter = exactCurrencyFormatters.get(currencyCode);
  if (!formatter) {
    try {
      formatter = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currencyCode,
        maximumFractionDigits: 2,
      });
    } catch {
      formatter = undefined;
    }
    if (formatter) exactCurrencyFormatters.set(currencyCode, formatter);
  }
  if (!formatter) return `${Number(value).toFixed(2)} ${currencyCode}`;
  return formatter.format(Number(value));
}

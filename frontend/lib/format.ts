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

/** e.g. 4682 -> "4.68K tokens" */
export function formatCompactTokens(value: number | string) {
  return `${compactNumberFormatter.format(Number(value))} tokens`;
}

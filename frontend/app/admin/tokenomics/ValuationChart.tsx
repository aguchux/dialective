'use client';

import { ValuationSnapshotRow } from '@/store/api';

interface ValuationChartProps {
  history: ValuationSnapshotRow[] | undefined;
  isLoading: boolean;
}

function buildPoints(values: number[], width: number, height: number): string {
  if (values.length === 0) return '';
  if (values.length === 1) return `0,${height / 2} ${width},${height / 2}`;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = height - ((value - min) / range) * height;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
}

function Sparkline({
  title,
  values,
  colorClassName,
  formatValue,
}: {
  title: string;
  values: number[];
  colorClassName: string;
  formatValue: (v: number) => string;
}) {
  const width = 300;
  const height = 80;
  const points = buildPoints(values, width, height);
  const first = values[0];
  const last = values[values.length - 1];
  const trendLabel =
    values.length < 2
      ? 'not enough data for a trend'
      : last >= first
        ? `trending up from ${formatValue(first)} to ${formatValue(last)}`
        : `trending down from ${formatValue(first)} to ${formatValue(last)}`;

  return (
    <div className="grid gap-2 rounded-lg border border-line bg-white p-5 shadow-[0_2px_8px_rgba(27,31,27,0.05)]">
      <p className="text-sm font-bold text-muted">{title}</p>
      {values.length === 0 ? (
        <p className="text-sm text-muted">No data yet.</p>
      ) : (
        <div className={colorClassName}>
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="h-20 w-full"
            role="img"
            aria-label={`${title}: ${trendLabel}`}
          >
            <title>
              {title}: {trendLabel}
            </title>
            <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" />
          </svg>
        </div>
      )}
      <p className="text-xs text-muted">
        Latest: {values.length > 0 ? formatValue(values[values.length - 1]) : '-'}
      </p>
    </div>
  );
}

export function ValuationChart({ history, isLoading }: ValuationChartProps) {
  // history arrives newest-first; render oldest -> newest, left to right.
  const chronological = [...(history ?? [])].reverse();
  const publishedValues = chronological.map((row) => Number(row.publishedValueUsd));
  const coverageValues = chronological
    .filter((row) => row.coverageRatio !== null)
    .map((row) => Number(row.coverageRatio) * 100);

  return (
    <section className="grid gap-4">
      <h2 className="text-2xl leading-snug">Trends</h2>
      {isLoading ? (
        <p className="text-sm text-muted">Loading...</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Sparkline
            title="DL published value"
            values={publishedValues}
            colorClassName="text-accent"
            formatValue={(v) => `$${v.toFixed(4)}`}
          />
          <Sparkline
            title="Reserve coverage ratio"
            values={coverageValues}
            colorClassName="text-[#1AAE5C]"
            formatValue={(v) => `${v.toFixed(1)}%`}
          />
        </div>
      )}
    </section>
  );
}

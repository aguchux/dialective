'use client';

import { cardClass } from '@/components/dashboard/shared';
import { formatCompactTokens } from '@/lib/format';
import type { TrainerReport } from '@/store/api';

/**
 * Flex-div daily bar chart -- recordings and earnings side by side per day.
 * Modeled on TrainerDashboard.tsx's EarningsChart, but consumes
 * TrainerReport.daily (a different shape) rather than EarningsChart_Bucket,
 * so it's its own small component rather than a reuse of that one.
 */
export function TrainerReportChart({ daily }: { daily: TrainerReport['daily'] }) {
  const maxRecordings = Math.max(...daily.map((day) => day.recordings), 1);
  const maxEarnings = Math.max(...daily.map((day) => Number(day.earningsTokens)), 1);
  const dense = daily.length > 21;

  if (daily.length === 0) {
    return (
      <div className={`${cardClass} grid h-56 place-items-center text-sm text-muted`}>
        No activity in this range.
      </div>
    );
  }

  return (
    <div className={`${cardClass} grid gap-6 p-4 md:p-5`}>
      <ChartRow
        bars={daily.map((day) => ({ date: day.date, value: day.recordings }))}
        color="bg-accent"
        dense={dense}
        label="Recordings"
        max={maxRecordings}
        valueFormatter={(value) => String(value)}
      />
      <ChartRow
        bars={daily.map((day) => ({ date: day.date, value: Number(day.earningsTokens) }))}
        color="bg-emerald-500"
        dense={dense}
        label="Earnings"
        max={maxEarnings}
        valueFormatter={(value) => formatCompactTokens(value)}
      />
    </div>
  );
}

function ChartRow({
  label,
  bars,
  max,
  color,
  dense,
  valueFormatter,
}: {
  label: string;
  bars: { date: string; value: number }[];
  max: number;
  color: string;
  dense: boolean;
  valueFormatter: (value: number) => string;
}) {
  return (
    <div>
      <p className="mb-2 text-sm font-extrabold text-muted">{label}</p>
      <div className="flex h-40 items-end gap-1 overflow-x-auto pb-1">
        {bars.map((bar) => {
          const height = bar.value > 0 ? Math.max((bar.value / max) * 100, 6) : 2;
          return (
            <div
              className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5"
              key={bar.date}
              title={`${formatBarDate(bar.date)}: ${valueFormatter(bar.value)}`}
            >
              {!dense && (
                <span className="text-[10px] font-bold text-muted">
                  {bar.value ? valueFormatter(bar.value) : ''}
                </span>
              )}
              <div className="flex w-full max-w-8 flex-1 items-end rounded-md bg-surface-muted">
                <div className={`w-full rounded-md ${color}`} style={{ height: `${height}%` }} />
              </div>
              <span className="text-[10px] font-extrabold text-muted">
                {dense ? formatBarDayNumber(bar.date) : formatBarDate(bar.date)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatBarDate(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
    date,
  );
}

function formatBarDayNumber(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return '';
  return String(date.getUTCDate());
}

'use client';

import { ComponentType, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { Activity, CheckCircle2, Clock3, Download, Play, Search as SearchIcon } from 'lucide-react';
import {
  useGetOrganizationQuery,
  useGetSubscriberAnalyticsReportQuery,
  useGetSubscriberAnalyticsTimeSeriesQuery,
  useListStreamDecksQuery,
  useSearchCatalogueQuery,
} from '@/store/api';
import { Card, PrimaryButton, SecondaryButton, TextInput } from '@/components/ui';
import { downloadCsvReport } from '@/lib/download-csv-report';
import { REPORTING_ROLES } from '@/lib/route-access';

const RANGE_DAYS = 30;

function isoDaysAgo(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function formatDateRangeLabel(fromIso: string, toIso: string): string {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${fmt(fromIso)} – ${fmt(toIso)}, ${new Date(toIso).getFullYear()}`;
}

function formatHours(hours: number): string {
  return hours.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 2 }).format(
    value,
  );
}

export default function OverviewPage() {
  const { data: session } = useSession();
  const canViewReports = Boolean(
    session?.user.orgRole && REPORTING_ROLES.includes(session.user.orgRole),
  );
  // middleware.ts redirects here with ?access=denied when a role lacks access
  // to the page it asked for -- without this the user is bounced to the
  // dashboard with no idea why.
  const accessDenied = useSearchParams().get('access') === 'denied';
  const { data: org } = useGetOrganizationQuery();
  const { data: decks } = useListStreamDecksQuery();
  const [search, setSearch] = useState('');
  const [downloading, setDownloading] = useState(false);

  const from = useMemo(() => isoDaysAgo(RANGE_DAYS), []);
  const to = useMemo(() => isoDaysAgo(0), []);

  const { data: analytics } = useGetSubscriberAnalyticsReportQuery(
    { from, to },
    { skip: !canViewReports },
  );
  const { data: timeSeries } = useGetSubscriberAnalyticsTimeSeriesQuery(
    { from, to },
    { skip: !canViewReports },
  );
  const { data: searchResults, isFetching: searching } = useSearchCatalogueQuery(
    { dialectTag: search || undefined, page: 1, pageSize: 3, sortBy: 'isvs_desc' },
    { skip: search.trim().length === 0 },
  );

  const chartData = useMemo(
    () =>
      (timeSeries ?? []).map((point) => ({
        day: new Date(point.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        successful: point.successfulRequests,
        failed: point.failedRequests,
      })),
    [timeSeries],
  );

  const successRatePct = analytics ? (analytics.successRate * 100).toFixed(2) : null;

  async function handleExport() {
    setDownloading(true);
    try {
      await downloadCsvReport(
        `/reports/subscriber-analytics?format=csv&from=${from}&to=${to}`,
        'subscriber-analytics-report.csv',
      );
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="grid gap-6">
      {accessDenied && (
        <p
          className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm font-bold text-amber-900"
          role="alert"
        >
          You don&apos;t have access to that page. Ask an organization owner or admin if you need
          it.
        </p>
      )}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-ink">Overview</h1>
          <p className="mt-1 text-sm text-muted">
            Welcome back, {org?.name ?? session?.user?.name ?? 'there'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex min-h-10 items-center rounded-lg border border-line bg-surface px-3.5 text-sm font-bold text-ink">
            {formatDateRangeLabel(from, to)}
          </span>
          {canViewReports && (
            <SecondaryButton
              disabled={downloading}
              onClick={() => void handleExport()}
              type="button"
            >
              <Download aria-hidden="true" className="size-3.5" />
              {downloading ? 'Exporting...' : 'Download'}
            </SecondaryButton>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <MetricCard
          icon={Clock3}
          label="Total Hours Streamed"
          value={analytics ? formatHours(analytics.totalHoursStreamed) : '—'}
          unit="hrs"
          chartData={chartData.map((p) => p.successful)}
        />
        <MetricCard
          icon={Activity}
          label="API Requests"
          value={analytics ? formatCompactNumber(analytics.totalRequests) : '—'}
          chartData={chartData.map((p) => p.successful)}
        />
        <MetricCard
          icon={CheckCircle2}
          label="Success Rate"
          value={successRatePct ? `${successRatePct}%` : '—'}
          chartData={chartData.map((p) => p.successful)}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-1">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-black text-ink">Dataset Search</p>
          </div>
          <div className="relative mb-3">
            <SearchIcon
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
            />
            <TextInput
              className="pl-9"
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search language, dialect, region..."
              value={search}
            />
          </div>
          <div className="grid gap-2">
            {search.trim().length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">
                Start typing a dialect tag to search the catalogue.
              </p>
            ) : searching ? (
              <p className="py-6 text-center text-sm text-muted">Searching...</p>
            ) : (searchResults?.items.length ?? 0) === 0 ? (
              <p className="py-6 text-center text-sm text-muted">No matching recordings.</p>
            ) : (
              searchResults?.items.map((item) => (
                <div
                  className="flex items-center gap-3 rounded-lg border border-line px-3 py-2.5"
                  key={item.recordingId}
                >
                  <button
                    className="grid size-8 shrink-0 place-items-center rounded-full bg-accent text-white"
                    type="button"
                    aria-label="Preview recording"
                  >
                    <Play aria-hidden="true" className="size-3.5" />
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-ink">
                      {item.dialect?.name ?? item.dialectTag}{' '}
                      {item.country ? `(${item.country.name})` : ''}
                    </p>
                    <p className="text-xs text-muted">
                      {item.durationMs ? `${Math.round(item.durationMs / 1000)}s` : '—'}
                    </p>
                  </div>
                  <span className="shrink-0 text-right">
                    <span className="block text-xs font-bold uppercase tracking-wide text-muted">
                      Score
                    </span>
                    <span className="block text-sm font-black text-accent">
                      {item.compositeScore ? Number(item.compositeScore).toFixed(2) : '—'}
                    </span>
                  </span>
                </div>
              ))
            )}
          </div>
          <Link
            className="mt-3 block rounded-lg border border-line py-2.5 text-center text-sm font-bold text-ink no-underline transition-colors hover:bg-surface-muted"
            href="/dashboard/explore"
          >
            View all results &rarr;
          </Link>
        </Card>

        <Card className="p-5 lg:col-span-1">
          <div className="mb-1 flex items-center justify-between">
            <p className="text-sm font-black text-ink">API Usage</p>
            <span className="text-xs font-bold uppercase tracking-wide text-muted">Requests</span>
          </div>
          <p className="mb-4 text-2xl font-black text-ink">
            {analytics ? formatCompactNumber(analytics.totalRequests) : '—'}
          </p>
          {chartData.length > 0 ? (
            <ResponsiveContainer height={220} width="100%">
              <BarChart data={chartData}>
                <XAxis
                  axisLine={false}
                  dataKey="day"
                  fontSize={11}
                  interval="preserveStartEnd"
                  stroke="var(--color-muted)"
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-line)',
                    borderRadius: 8,
                    color: 'var(--color-ink)',
                  }}
                />
                <Bar
                  dataKey="successful"
                  fill="var(--color-accent)"
                  radius={[3, 3, 0, 0]}
                  stackId="a"
                />
                <Bar
                  dataKey="failed"
                  fill="var(--color-danger)"
                  radius={[3, 3, 0, 0]}
                  stackId="a"
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="py-16 text-center text-sm text-muted">No API usage yet.</p>
          )}
          <div className="mt-2 flex items-center gap-4 text-xs font-semibold text-muted">
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-accent" /> Successful
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-danger" /> Failed
            </span>
          </div>
        </Card>

        <Card className="p-5 lg:col-span-1">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-black text-ink">Stream Decks</p>
            <Link className="text-sm font-bold text-accent no-underline" href="/dashboard/decks">
              View all
            </Link>
          </div>
          <div className="grid gap-2">
            {(decks ?? []).length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">No Stream Decks yet.</p>
            ) : (
              decks!.slice(0, 3).map((deck) => (
                <div className="rounded-lg border border-line px-3 py-2.5" key={deck.id}>
                  <p className="truncate text-sm font-bold text-accent">{deck.deckKey}</p>
                  <div className="mt-1 flex items-center justify-between">
                    <span className="text-xs text-muted">{deck._count?.items ?? 0} recordings</span>
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-success">
                      <span className="size-1.5 rounded-full bg-success" /> Active
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      {!org?.subscription ||
      org.subscription.status === 'CANCELED' ||
      org.subscription.status === 'SUSPENDED' ? (
        <Card className="border-warning/30 bg-warning/5 p-5">
          <p className="font-bold text-ink">
            Activate a subscription to start streaming voice data
          </p>
          <p className="mt-1 text-sm text-muted">
            Search and preview are always available; creating Stream Decks and previewing recordings
            require an active monthly subscription.
          </p>
          <Link className="mt-3 inline-block" href="/dashboard/billing">
            <PrimaryButton type="button">View plans</PrimaryButton>
          </Link>
        </Card>
      ) : null}
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  unit,
  chartData,
}: {
  icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>;
  label: string;
  value: string;
  unit?: string;
  chartData: number[];
}) {
  const sparkline = useMemo(() => chartData.slice(-14).map((v, i) => ({ i, v })), [chartData]);

  return (
    <Card className="flex min-h-32 items-start gap-3 p-4 md:p-5">
      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
        <Icon aria-hidden="true" className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-muted">{label}</p>
        <p className="mt-2 text-2xl font-black leading-tight text-ink">
          {value}
          {unit && <span className="ml-1.5 text-sm font-bold text-muted">{unit}</span>}
        </p>
        {sparkline.length > 1 && (
          <div className="mt-2 h-8">
            <ResponsiveContainer height="100%" width="100%">
              <BarChart data={sparkline}>
                <Bar dataKey="v" fill="var(--color-accent)" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </Card>
  );
}

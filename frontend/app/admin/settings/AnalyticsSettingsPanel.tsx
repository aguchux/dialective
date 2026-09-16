'use client';

import { useEffect, useState } from 'react';
import {
  dialectivaApi,
  normalizeErrorMessage,
  useGetPlatformSettingsQuery,
  useUpdatePlatformSettingsMutation,
} from '@/store/api';
import { ActionButton } from '@/components/ui/ActionButton';

const inputClass =
  'min-h-10 w-full rounded-lg border border-line bg-white px-3 py-2.5 text-ink dark:bg-surface-muted';
const primaryButtonClass =
  'inline-flex min-h-10 items-center justify-center rounded-lg border border-accent bg-accent px-3.5 py-2.5 font-bold text-white transition-colors hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60';

const MEASUREMENT_ID_PATTERN = /^G-[A-Z0-9]{6,12}$/;

export function AnalyticsSettingsPanel() {
  const { data: settings, isLoading } = useGetPlatformSettingsQuery();
  const [updateSettings, { isLoading: isSaving }] = useUpdatePlatformSettingsMutation();

  const [googleAnalyticsEnabled, setGoogleAnalyticsEnabled] = useState(false);
  const [googleAnalyticsMeasurementId, setGoogleAnalyticsMeasurementId] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!settings) return;
    setGoogleAnalyticsEnabled(settings.googleAnalyticsEnabled);
    setGoogleAnalyticsMeasurementId(settings.googleAnalyticsMeasurementId ?? '');
  }, [settings]);

  const trimmedId = googleAnalyticsMeasurementId.trim();
  const idLooksValid = trimmedId === '' || MEASUREMENT_ID_PATTERN.test(trimmedId);
  const missingId = googleAnalyticsEnabled && !trimmedId;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setError(null);

    if (!idLooksValid) {
      setError('Measurement ID should look like a GA4 ID, e.g. G-ABC1234567.');
      return;
    }

    try {
      await updateSettings({
        googleAnalyticsEnabled,
        googleAnalyticsMeasurementId: trimmedId || null,
      }).unwrap();
      setMessage('Analytics settings saved.');
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to save analytics settings.'));
    }
  }

  return (
    <section className="grid gap-4 rounded-lg border border-line bg-white p-5 shadow-[0_2px_8px_rgba(27,31,27,0.05)]">
      <div className="grid gap-1">
        <h2 className="text-2xl leading-snug">Analytics &amp; Metrics</h2>
        <p className="leading-relaxed text-muted">
          Google Analytics (gtag.js) only loads for a visitor once they&rsquo;ve acknowledged the
          cookie consent banner, and only once this toggle is on and a Measurement ID is set below --
          a half-configured toggle never ships a broken tag to visitors, and nobody is tracked before
          consenting.
        </p>
      </div>

      {isLoading && <p className="text-muted">Loading...</p>}
      {!isLoading && (
        <form className="grid gap-4 md:max-w-md" onSubmit={handleSave}>
          <div>
            <label
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-surface-muted p-4"
              htmlFor="google-analytics-enabled"
            >
              <input
                checked={googleAnalyticsEnabled}
                className="mt-0.5 size-5 accent-accent"
                id="google-analytics-enabled"
                onChange={(event) => setGoogleAnalyticsEnabled(event.target.checked)}
                type="checkbox"
              />
              <span>
                <span className="block font-bold">Enable Google Analytics</span>
                <span className="mt-1 block text-sm leading-relaxed text-muted">
                  Master switch -- when off, no GA script is ever loaded, regardless of the
                  Measurement ID below.
                </span>
              </span>
            </label>
          </div>

          <div className="grid gap-1">
            <label className="font-bold" htmlFor="google-analytics-measurement-id">
              Measurement ID
            </label>
            <input
              className={inputClass}
              id="google-analytics-measurement-id"
              onChange={(e) => setGoogleAnalyticsMeasurementId(e.target.value)}
              placeholder="e.g. G-ABC1234567"
              value={googleAnalyticsMeasurementId}
            />
            <p className="text-sm leading-relaxed text-muted">
              From the GA4 property&rsquo;s Data Streams page. GA4 IDs only (starting with{' '}
              <code>G-</code>) -- the older Universal Analytics <code>UA-</code> format isn&rsquo;t
              supported.
            </p>
          </div>

          {!idLooksValid && (
            <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm font-bold text-danger">
              That doesn&rsquo;t look like a GA4 Measurement ID (expected e.g. G-ABC1234567).
            </p>
          )}

          {idLooksValid && missingId && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800">
              Enabled, but analytics won&rsquo;t load until a Measurement ID is filled in.
            </p>
          )}

          <div>
            <ActionButton
              className={primaryButtonClass}
              type="submit"
              pending={isSaving}
              pendingLabel="Saving"
            >
              Save analytics settings
            </ActionButton>
          </div>
        </form>
      )}

      {message && <p className="leading-relaxed text-accent-dark">{message}</p>}
      {error && (
        <p className="leading-relaxed text-danger" role="alert">
          {error}
        </p>
      )}

      <AnalyticsReportPanel />
    </section>
  );
}

interface AnalyticsSummary {
  configured: boolean;
  lastFetchedAt: string | null;
  days: number;
  totals: {
    activeUsers: number;
    newUsers: number;
    sessions: number;
    screenPageViews: number;
    conversions: number;
  };
  daily: {
    date: string;
    activeUsers: number;
    newUsers: number;
    sessions: number;
    screenPageViews: number;
    averageSessionSeconds: string;
    engagementRate: string;
    conversions: number;
  }[];
}

interface AnalyticsBreakdownRow {
  value: string;
  activeUsers: number;
  screenPageViews: number;
}

const analyticsReportApi = dialectivaApi.injectEndpoints({
  endpoints: (builder) => ({
    getAnalyticsSummary: builder.query<AnalyticsSummary, { days: number }>({
      query: ({ days }) => `/admin/analytics/summary?days=${days}`,
    }),
    getAnalyticsBreakdown: builder.query<AnalyticsBreakdownRow[], { dimension: string; days: number }>({
      query: ({ dimension, days }) => `/admin/analytics/breakdown?dimension=${dimension}&days=${days}`,
    }),
  }),
});

const DAY_RANGE_OPTIONS = [7, 30, 90] as const;
const BREAKDOWN_TABS = [
  { key: 'page', label: 'Top pages' },
  { key: 'country', label: 'Top countries' },
  { key: 'deviceCategory', label: 'Devices' },
] as const;

function formatNumber(value: number): string {
  return value.toLocaleString();
}

/**
 * Read-only report over AnalyticsDailySnapshot/AnalyticsDailyBreakdown --
 * data ingested by the google-analytics-job CronJob on its own schedule
 * (see k8s/base/google-analytics-cronjob.yaml), not a live GA Data API
 * call. Shows "not configured yet" (rather than an empty chart) until
 * that job has run at least once with real GCP credentials, since a page
 * with all-zero numbers looks broken, not merely unconfigured.
 */
function AnalyticsReportPanel() {
  const [days, setDays] = useState<(typeof DAY_RANGE_OPTIONS)[number]>(30);
  const [breakdownDimension, setBreakdownDimension] =
    useState<(typeof BREAKDOWN_TABS)[number]['key']>('page');
  const { data: summary, isLoading: summaryLoading } =
    analyticsReportApi.useGetAnalyticsSummaryQuery({ days });
  const { data: breakdown, isLoading: breakdownLoading } =
    analyticsReportApi.useGetAnalyticsBreakdownQuery({ dimension: breakdownDimension, days });

  return (
    <div className="grid gap-4 border-t border-line pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-bold">Traffic report</h3>
        <div className="flex gap-1">
          {DAY_RANGE_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setDays(option)}
              className={`rounded-lg border px-2.5 py-1 text-xs font-bold ${
                days === option
                  ? 'border-accent bg-accent-soft text-accent'
                  : 'border-line bg-surface text-muted hover:bg-surface-muted'
              }`}
            >
              {option}d
            </button>
          ))}
        </div>
      </div>

      {summaryLoading && <p className="text-sm text-muted">Loading report...</p>}

      {!summaryLoading && summary && !summary.configured && (
        <p className="rounded-lg border border-line bg-surface-muted px-3 py-3 text-sm leading-relaxed text-muted">
          No data ingested yet. The scheduled ingestion job
          (google-analytics-job) needs a GCP service account and GA4
          Property ID configured before it can pull traffic data -- this
          report will populate automatically once that job has run.
        </p>
      )}

      {!summaryLoading && summary && summary.configured && (
        <>
          <p className="text-xs text-muted">
            Last ingested {new Date(summary.lastFetchedAt!).toLocaleString()}
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {(
              [
                ['Active users', summary.totals.activeUsers],
                ['New users', summary.totals.newUsers],
                ['Sessions', summary.totals.sessions],
                ['Page views', summary.totals.screenPageViews],
                ['Conversions', summary.totals.conversions],
              ] as const
            ).map(([label, value]) => (
              <div className="rounded-lg border border-line bg-surface-muted p-3" key={label}>
                <p className="text-xs font-bold uppercase tracking-wide text-muted">{label}</p>
                <p className="text-xl font-black">{formatNumber(value)}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-2">
            <div className="flex gap-1">
              {BREAKDOWN_TABS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setBreakdownDimension(tab.key)}
                  className={`rounded-lg border px-2.5 py-1 text-xs font-bold ${
                    breakdownDimension === tab.key
                      ? 'border-accent bg-accent-soft text-accent'
                      : 'border-line bg-surface text-muted hover:bg-surface-muted'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            {breakdownLoading && <p className="text-sm text-muted">Loading...</p>}
            {!breakdownLoading && (!breakdown || breakdown.length === 0) && (
              <p className="text-sm text-muted">No data for this range yet.</p>
            )}
            {!breakdownLoading && breakdown && breakdown.length > 0 && (
              <div className="overflow-x-auto rounded-lg border border-line">
                <table className="w-full min-w-100 border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-line text-xs font-bold uppercase tracking-wide text-muted">
                      <th className="px-3 py-2">
                        {BREAKDOWN_TABS.find((t) => t.key === breakdownDimension)?.label}
                      </th>
                      <th className="px-3 py-2 text-right">Active users</th>
                      <th className="px-3 py-2 text-right">Page views</th>
                    </tr>
                  </thead>
                  <tbody>
                    {breakdown.map((row) => (
                      <tr className="border-b border-line last:border-0" key={row.value}>
                        <td className="px-3 py-2">{row.value}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatNumber(row.activeUsers)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatNumber(row.screenPageViews)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

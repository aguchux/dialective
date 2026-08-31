'use client';

import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Download } from 'lucide-react';
import { useGetSubscriberAnalyticsReportQuery } from '@/store/api';
import { Card, PageHeading, SecondaryButton } from '@/components/ui';
import { downloadCsvReport } from '@/lib/download-csv-report';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unitIndex = -1;
  do {
    value /= 1024;
    unitIndex++;
  } while (value >= 1024 && unitIndex < units.length - 1);
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

export default function AnalyticsPage() {
  const { data, isLoading } = useGetSubscriberAnalyticsReportQuery();
  const [downloading, setDownloading] = useState(false);

  const dailyBytes = useMemo(() => {
    if (!data) return [];
    const byDay = new Map<string, number>();
    for (const row of data.rows) {
      const day = row.createdAt.slice(0, 10);
      byDay.set(day, (byDay.get(day) ?? 0) + Number(row.bytesStreamed));
    }
    return [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, bytes]) => ({ day, megabytes: Number((bytes / (1024 * 1024)).toFixed(2)) }));
  }, [data]);

  async function handleExport() {
    setDownloading(true);
    try {
      await downloadCsvReport('/reports/subscriber-analytics?format=csv', 'subscriber-analytics-report.csv');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <PageHeading
          subtitle="How your organization is using Voice Stream -- requests, audio streamed, and denial rate."
          title="Analytics"
        />
        <SecondaryButton disabled={downloading || !data} onClick={() => void handleExport()} type="button">
          <Download aria-hidden="true" className="size-3.5" />
          {downloading ? 'Exporting...' : 'Export CSV'}
        </SecondaryButton>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted">Loading...</p>
      ) : data ? (
        <>
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card className="p-5">
              <p className="text-xs font-bold uppercase tracking-wide text-muted">Total requests</p>
              <p className="mt-1 text-2xl font-black text-ink">{data.totalRequests.toLocaleString()}</p>
            </Card>
            <Card className="p-5">
              <p className="text-xs font-bold uppercase tracking-wide text-muted">Audio streamed</p>
              <p className="mt-1 text-2xl font-black text-ink">
                {formatBytes(Number(data.totalBytesStreamed))}
              </p>
            </Card>
            <Card className="p-5">
              <p className="text-xs font-bold uppercase tracking-wide text-muted">Denial rate</p>
              <p className="mt-1 text-2xl font-black text-ink">
                {(data.deniedRequestRate * 100).toFixed(1)}%
              </p>
            </Card>
          </div>

          <Card className="mb-6 p-5">
            <p className="mb-4 text-xs font-bold uppercase tracking-wide text-muted">
              Audio streamed per day (MB)
            </p>
            {dailyBytes.length > 0 ? (
              <ResponsiveContainer height={260} width="100%">
                <BarChart data={dailyBytes}>
                  <CartesianGrid stroke="var(--color-line, #e5e7eb)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="day" fontSize={11} tickLine={false} />
                  <YAxis fontSize={11} tickLine={false} />
                  <Tooltip />
                  <Bar dataKey="megabytes" fill="#6366f1" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="p-5 text-center text-sm text-muted">No audio requests yet.</p>
            )}
          </Card>

          <Card className="p-5">
            <p className="mb-3 text-xs font-bold uppercase tracking-wide text-muted">Top decks by requests</p>
            {data.topDecksByRequests.length > 0 ? (
              <div className="divide-y divide-line">
                {data.topDecksByRequests.map((row) => (
                  <div className="flex items-center justify-between py-2 text-sm" key={row.deckId ?? 'none'}>
                    <span className="text-ink">{row.deckId ?? 'Unscoped'}</span>
                    <span className="font-bold text-ink">{row.requests.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted">No requests yet.</p>
            )}
          </Card>
        </>
      ) : (
        <p className="text-sm text-muted">No analytics available.</p>
      )}
    </div>
  );
}

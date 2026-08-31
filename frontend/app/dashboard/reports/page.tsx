'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Download, Printer, RefreshCw } from 'lucide-react';
import { PortalContainerProvider } from '@/components/ui/PortalContainer';
import { cardClass } from '@/components/dashboard/shared';
import { DashboardHeader, emailName, MobileNavigation } from '@/components/dashboard/DashboardShell';
import { TrainerReportChart } from '@/components/reports/TrainerReportChart';
import { formatCompactTokens } from '@/lib/format';
import { useGetTrainerReportQuery } from '@/store/api';

type Preset = 'week' | 'month' | 'lifetime';

function isoDateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function presetRange(preset: Exclude<Preset, 'lifetime'>): { from: string; to: string } {
  const to = new Date();
  const days = preset === 'week' ? 7 : 30;
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  return { from: isoDateInputValue(from), to: isoDateInputValue(to) };
}

export default function TrainerReportsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [themeRoot, setThemeRoot] = useState<HTMLDivElement | null>(null);
  const [preset, setPreset] = useState<Preset>('lifetime');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const reportRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

  const { data, isLoading, isFetching, isError, refetch } = useGetTrainerReportQuery(
    { from: from || undefined, to: to || undefined },
    { skip: status !== 'authenticated' },
  );

  const totals = useMemo(() => data?.totals, [data]);

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login');
  }, [router, status]);

  function applyPreset(next: Preset) {
    setPreset(next);
    if (next === 'lifetime') {
      setFrom('');
      setTo('');
      return;
    }
    const range = presetRange(next);
    setFrom(range.from);
    setTo(range.to);
  }

  async function handleExportPdf() {
    if (!reportRef.current) return;
    setExporting(true);
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ]);
      const canvas = await html2canvas(reportRef.current, { scale: 2 });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pageWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      let remainingHeight = imgHeight;
      let offsetY = 0;
      pdf.addImage(imgData, 'PNG', 0, offsetY, imgWidth, imgHeight);
      remainingHeight -= pageHeight;
      while (remainingHeight > 0) {
        offsetY -= pageHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, offsetY, imgWidth, imgHeight);
        remainingHeight -= pageHeight;
      }
      pdf.save('dialect-library-report.pdf');
    } finally {
      setExporting(false);
    }
  }

  if (status === 'loading' || !session) {
    return <div className="dashboard-theme min-h-screen bg-bg" />;
  }

  const displayName =
    [session.user.firstName, session.user.lastName].filter(Boolean).join(' ') ||
    emailName(session.user.email);

  return (
    <div className="dashboard-theme min-h-screen bg-bg text-ink" ref={setThemeRoot}>
      <PortalContainerProvider container={themeRoot}>
        <style>{`
          @media print {
            .no-print { display: none !important; }
            body { background: white; }
          }
        `}</style>

        <DashboardHeader
          activeView={null}
          displayName={displayName}
          email={session.user.email ?? 'Trainer'}
          image={session.user.image}
        />

        <main className="mx-auto grid w-full max-w-4xl content-start gap-6 px-4 pb-28 pt-6 md:px-6 md:pt-9 lg:pb-12">
          <header className="no-print flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-black">Your report</h1>
              <p className="mt-1 leading-relaxed text-muted">
                Recordings, scores, and earnings for the selected date range.
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-line bg-white px-3.5 text-sm font-extrabold hover:bg-surface-muted"
                onClick={() => window.print()}
                type="button"
              >
                <Printer className="size-4" aria-hidden="true" /> Print
              </button>
              <button
                className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-accent bg-accent px-3.5 text-sm font-extrabold text-white transition-colors hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60"
                disabled={exporting || !data}
                onClick={() => void handleExportPdf()}
                type="button"
              >
                {exporting ? (
                  <RefreshCw className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Download className="size-4" aria-hidden="true" />
                )}
                Export PDF
              </button>
            </div>
          </header>

          <div className="no-print flex flex-wrap items-center gap-3">
            <div className="inline-flex rounded-lg border border-line bg-surface p-1" role="tablist">
              {(
                [
                  { id: 'lifetime', label: 'Since signup' },
                  { id: 'month', label: 'This month' },
                  { id: 'week', label: 'This week' },
                ] as { id: Preset; label: string }[]
              ).map((option) => (
                <button
                  aria-selected={preset === option.id}
                  className={`min-h-9 rounded-md px-3.5 text-sm font-extrabold transition-colors ${preset === option.id ? 'bg-accent text-white' : 'text-muted hover:text-ink'}`}
                  key={option.id}
                  onClick={() => applyPreset(option.id)}
                  role="tab"
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 text-sm">
              <label className="font-bold text-muted" htmlFor="report-from">
                From
              </label>
              <input
                className="min-h-9 rounded-lg border border-line bg-white px-2.5 text-ink"
                id="report-from"
                max={to || undefined}
                onChange={(e) => {
                  setPreset('lifetime');
                  setFrom(e.target.value);
                }}
                type="date"
                value={from}
              />
              <label className="font-bold text-muted" htmlFor="report-to">
                To
              </label>
              <input
                className="min-h-9 rounded-lg border border-line bg-white px-2.5 text-ink"
                id="report-to"
                min={from || undefined}
                onChange={(e) => {
                  setPreset('lifetime');
                  setTo(e.target.value);
                }}
                type="date"
                value={to}
              />
            </div>
          </div>

          {isLoading && (
            <div className="grid min-h-52 place-items-center" role="status">
              <RefreshCw className="size-6 animate-spin text-accent" aria-hidden="true" />
            </div>
          )}

          {isError && !isLoading && (
            <div className="grid min-h-52 place-items-center gap-3 p-5 text-center">
              <p className="font-extrabold">Could not load your report.</p>
              <button
                className="min-h-10 rounded-lg border border-line px-4 text-sm font-extrabold hover:bg-surface-muted"
                onClick={() => void refetch()}
                type="button"
              >
                Try again
              </button>
            </div>
          )}

          {data && totals && (
            <div className="grid gap-6" ref={reportRef}>
              <h2 className="hidden text-2xl font-black print:block">
                Dialect Library -- Your report
              </h2>
              <section className="grid grid-cols-2 gap-3 md:grid-cols-3" aria-label="Report summary">
                <StatCard label="Recordings" value={String(totals.recordings)} />
                <StatCard label="Avg. score" value={totals.avgScore ? `${totals.avgScore}%` : '—'} />
                <StatCard
                  label="Training earnings"
                  value={formatCompactTokens(totals.trainingEarningsTokens)}
                />
                <StatCard
                  label="Referral earnings"
                  value={formatCompactTokens(totals.referralEarningsTokens)}
                />
                <StatCard
                  label="Total earned"
                  value={formatCompactTokens(totals.totalEarningsTokens)}
                />
                <StatCard label="Scored" value={String(totals.scoredRecordings)} />
              </section>

              <TrainerReportChart daily={data.daily} />

              {isFetching && (
                <p className="no-print text-center text-xs font-bold text-muted">Refreshing...</p>
              )}
            </div>
          )}
        </main>

        <MobileNavigation activeView={null} />
      </PortalContainerProvider>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className={`${cardClass} grid gap-1 p-4`}>
      <span className="text-xs font-extrabold uppercase tracking-wide text-muted">{label}</span>
      <span className="text-xl font-black text-ink">{value}</span>
    </div>
  );
}

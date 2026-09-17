'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Download } from 'lucide-react';
import { PortalContainerProvider } from '@/components/ui/PortalContainer';
import { DashboardHeader, emailName } from '@/components/dashboard/DashboardShell';
import {
  normalizeErrorMessage,
  ProofAccountReport,
  useGetMyProofAccountReportQuery,
  useLazyGetMyProofAccountReportPdfUrlQuery,
} from '@/store/api';

function formatTokens(value: string) {
  const number = Number(value);
  return Number.isFinite(number)
    ? number.toLocaleString(undefined, { maximumFractionDigits: 4 })
    : value;
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

const statLabel = 'text-xs font-bold uppercase text-muted';
const statValue = 'text-2xl font-black text-ink';

export default function MyProofAccountReportPage() {
  const params = useParams<{ id: string }>();
  const { data: session, status } = useSession();
  const router = useRouter();
  const [themeRoot, setThemeRoot] = useState<HTMLDivElement | null>(null);
  const { data, isLoading, isError, refetch } = useGetMyProofAccountReportQuery(undefined, {
    skip: status !== 'authenticated',
  });
  const [fetchPdfUrl, { isFetching: downloading }] = useLazyGetMyProofAccountReportPdfUrlQuery();
  const [error, setError] = useState<string | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login');
  }, [router, status]);

  useEffect(() => {
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [objectUrl]);

  async function downloadPdf() {
    setError(null);
    try {
      const url = await fetchPdfUrl().unwrap();
      setObjectUrl(url);
      const link = document.createElement('a');
      link.href = url;
      link.download = `proof-account-${params.id}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to generate the PDF.'));
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
        <DashboardHeader
          activeView={null}
          displayName={displayName}
          email={session.user.email ?? 'Trainer'}
          image={session.user.image}
        />

        <main className="mx-auto grid w-full max-w-4xl content-start gap-6 px-4 pb-28 pt-6 md:px-6 md:pt-9 lg:pb-12">
          <header className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-black">Your account proof report</h1>
              <p className="mt-1 leading-relaxed text-muted">
                A full lifetime breakdown of your token balance -- every transaction, and how they
                add up.
              </p>
            </div>
            {data && (
              <button
                className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg border border-accent bg-accent px-3.5 text-sm font-extrabold text-white transition-colors hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60"
                disabled={downloading}
                onClick={() => void downloadPdf()}
                type="button"
              >
                <Download className="size-4" aria-hidden="true" />
                {downloading ? 'Generating...' : 'Download PDF'}
              </button>
            )}
          </header>

          {error && (
            <p className="leading-relaxed text-danger" role="alert">
              {error}
            </p>
          )}

          {isLoading ? (
            <p className="text-muted">Loading...</p>
          ) : isError || !data ? (
            <div className="grid gap-3 rounded-lg border border-line bg-white p-5 text-center shadow-[0_2px_8px_rgba(27,31,27,0.05)]">
              <p className="font-extrabold">
                No proof report has been shared with you yet. If you were expecting one, contact
                support.
              </p>
              <button
                className="inline-flex min-h-9 w-fit items-center justify-center justify-self-center rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-bold text-ink transition-colors hover:bg-surface-muted"
                onClick={() => void refetch()}
                type="button"
              >
                Try again
              </button>
            </div>
          ) : (
            <ReportBody report={data.report} sharedAt={data.sharedAt} />
          )}
        </main>
      </PortalContainerProvider>
    </div>
  );
}

function ReportBody({ report, sharedAt }: { report: ProofAccountReport; sharedAt: string }) {
  const stats: [string, string][] = [
    ['Total tokens since join', `${formatTokens(report.summary.totalTokensSinceJoin)} DL`],
    ['Available balance', `${formatTokens(report.summary.availableBalanceTokens)} DL`],
    ['Held balance', `${formatTokens(report.summary.heldBalanceTokens)} DL`],
    ['Total withdrawn', `${formatTokens(report.summary.totalWithdrawnTokens)} DL`],
    ['Total recordings', report.summary.totalRecordings.toLocaleString()],
    ['Scored recordings', report.summary.scoredRecordings.toLocaleString()],
    ['Average score', report.summary.avgScore ? `${report.summary.avgScore}%` : '—'],
  ];

  return (
    <div className="grid gap-6">
      <section className="grid gap-4 rounded-lg border border-line bg-white p-5 shadow-[0_2px_8px_rgba(27,31,27,0.05)]">
        <p className="text-xs text-muted">
          Account opened {formatDate(report.accountCreatedAt)} &middot; shared with you{' '}
          {formatDateTime(sharedAt)}
        </p>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {stats.map(([label, value]) => (
            <div key={label} className="grid gap-1">
              <span className={statLabel}>{label}</span>
              <span className={statValue}>{value}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-3 rounded-lg border border-line bg-white p-5 shadow-[0_2px_8px_rgba(27,31,27,0.05)]">
        <div className="grid gap-1">
          <h2 className="text-lg font-extrabold">Balance breakdown by transaction type</h2>
          <p className="text-sm text-muted">
            Every credit and debit type ever posted to your wallet, summed -- this is what adds up
            to the totals above.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-140 border-collapse text-left text-sm">
            <thead className="border-b border-line text-xs font-extrabold uppercase text-muted">
              <tr>
                <th className="py-2.5 pr-4">Type</th>
                <th className="py-2.5 pr-4 text-right">Count</th>
                <th className="py-2.5 text-right">Net amount (DL)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {report.ledgerTotalsByType.length === 0 ? (
                <tr>
                  <td className="py-3 text-muted" colSpan={3}>
                    No ledger activity yet.
                  </td>
                </tr>
              ) : (
                report.ledgerTotalsByType.map((row) => (
                  <tr key={row.type}>
                    <td className="py-2.5 pr-4 font-bold">{row.type.replace(/_/g, ' ')}</td>
                    <td className="py-2.5 pr-4 text-right text-muted">
                      {row.count.toLocaleString()}
                    </td>
                    <td
                      className={`py-2.5 text-right font-bold tabular-nums ${
                        Number(row.totalAmount) < 0 ? 'text-danger' : 'text-accent'
                      }`}
                    >
                      {formatTokens(row.totalAmount)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-3 rounded-lg border border-line bg-white p-5 shadow-[0_2px_8px_rgba(27,31,27,0.05)]">
        <div className="grid gap-1">
          <h2 className="text-lg font-extrabold">Full transaction history</h2>
          <p className="text-sm text-muted">
            Every ledger entry on your wallet, oldest first (
            {report.ledgerEntries.length.toLocaleString()} total).
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-160 border-collapse text-left text-sm">
            <thead className="border-b border-line text-xs font-extrabold uppercase text-muted">
              <tr>
                <th className="py-2.5 pr-4">Date</th>
                <th className="py-2.5 pr-4">Type</th>
                <th className="py-2.5 pr-4 text-right">Amount (DL)</th>
                <th className="py-2.5">Reference</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {report.ledgerEntries.length === 0 ? (
                <tr>
                  <td className="py-3 text-muted" colSpan={4}>
                    No transactions yet.
                  </td>
                </tr>
              ) : (
                report.ledgerEntries.map((entry) => (
                  <tr key={entry.id}>
                    <td className="py-2.5 pr-4 text-muted">{formatDate(entry.createdAt)}</td>
                    <td className="py-2.5 pr-4 font-bold">{entry.type.replace(/_/g, ' ')}</td>
                    <td
                      className={`py-2.5 pr-4 text-right font-bold tabular-nums ${
                        Number(entry.amount) < 0 ? 'text-danger' : 'text-accent'
                      }`}
                    >
                      {formatTokens(entry.amount)}
                    </td>
                    <td className="py-2.5 text-muted">{entry.reference ?? '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

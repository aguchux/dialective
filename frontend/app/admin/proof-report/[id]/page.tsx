'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Download, Send } from 'lucide-react';
import { AdminShell } from '@/components/admin/AdminShell';
import { ActionButton } from '@/components/ui/ActionButton';
import {
  normalizeErrorMessage,
  ProofAccountReportResponse,
  useGetProofAccountReportQuery,
  useLazyGetProofAccountReportPdfUrlQuery,
  useSendProofAccountReportMutation,
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

export default function ProofAccountReportPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { data, isLoading, isError, refetch } = useGetProofAccountReportQuery(id);
  const [fetchPdfUrl, { isFetching: downloading }] = useLazyGetProofAccountReportPdfUrlQuery();
  const [sendReport, { isLoading: sending }] = useSendProofAccountReportMutation();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [objectUrl]);

  async function downloadPdf() {
    setError(null);
    try {
      const url = await fetchPdfUrl(id).unwrap();
      setObjectUrl(url);
      const link = document.createElement('a');
      link.href = url;
      link.download = `proof-account-${id}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to generate the PDF.'));
    }
  }

  async function sendToTrainer() {
    setError(null);
    setNotice(null);
    try {
      await sendReport(id).unwrap();
      setNotice('Sent -- the trainer can now view and download this report from their dashboard.');
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to send this report.'));
    }
  }

  return (
    <AdminShell>
      <div className="grid gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="grid gap-2">
            <Link
              className="inline-flex w-fit items-center gap-1.5 text-sm font-bold text-muted hover:text-ink"
              href="/admin/leaderboard"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              Back to leaderboard
            </Link>
            <h1 className="text-3xl font-black">Account proof report</h1>
            <p className="leading-relaxed text-muted">
              Full lifetime reconciliation -- every ledger entry that makes up this account&apos;s
              balance, suitable for sending to a trainer who has questioned their numbers.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <ActionButton
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-line bg-surface px-4 py-2.5 font-bold text-ink transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => void sendToTrainer()}
              pending={sending}
              pendingLabel="Sending"
              type="button"
            >
              <Send className="size-4" aria-hidden="true" />
              Send to trainer
            </ActionButton>
            <ActionButton
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-accent bg-accent px-4 py-2.5 font-bold text-white transition-colors hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => void downloadPdf()}
              pending={downloading}
              pendingLabel="Generating"
              type="button"
            >
              <Download className="size-4" aria-hidden="true" />
              Download PDF
            </ActionButton>
          </div>
        </div>

        {notice && (
          <p className="leading-relaxed text-accent" role="status">
            {notice}
          </p>
        )}
        {error && (
          <p className="leading-relaxed text-danger" role="alert">
            {error}
          </p>
        )}

        {isLoading ? (
          <p className="text-muted">Loading...</p>
        ) : isError || !data ? (
          <div className="grid gap-3 rounded-lg border border-line bg-white p-5 text-center shadow-[0_2px_8px_rgba(27,31,27,0.05)]">
            <p className="font-extrabold">Could not load this report.</p>
            <button
              className="inline-flex min-h-9 w-fit items-center justify-center justify-self-center rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-bold text-ink transition-colors hover:bg-surface-muted"
              onClick={() => void refetch()}
              type="button"
            >
              Try again
            </button>
          </div>
        ) : (
          <ReportBody data={data} />
        )}
      </div>
    </AdminShell>
  );
}

function ReportBody({ data }: { data: ProofAccountReportResponse }) {
  const { user, report } = data;
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || user.email;

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
        <div className="grid gap-1">
          <h2 className="text-xl font-black">{name}</h2>
          <p className="text-sm text-muted">{user.email}</p>
          <p className="text-xs text-muted">
            Account opened {formatDate(report.accountCreatedAt)} &middot; generated{' '}
            {formatDateTime(report.generatedAt)}
          </p>
        </div>
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
            Every credit and debit type ever posted to this wallet, summed -- this is what adds up
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
            Every ledger entry on this wallet, oldest first (
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

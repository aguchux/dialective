'use client';

import { useState } from 'react';
import { AdminShell } from '@/components/admin/AdminShell';
import { DataTable, DataTableColumn } from '@/components/ui/DataTable';
import {
  ConnectRegistrationRow,
  useDecideConnectSpeakerMutation,
  useGetConnectAdminOverviewQuery,
  useResendConnectPhotoLinkMutation,
  useSendConnectRemindersMutation,
} from '@/store/api';

/**
 * Admin view of Dialect Library Connect 2026: who is coming, who applied
 * to speak, and the two bulk actions (reminders to everyone, reminders to
 * approved speakers with their own topic in the body).
 *
 * Speaker approval is the reason this page exists rather than a row in a
 * generic leads table -- approving mints a 48-hour photo-upload link and
 * emails it, so the decision has a side effect worth seeing confirmed.
 */
export default function AdminConnectPage() {
  const { data, isLoading } = useGetConnectAdminOverviewQuery();
  const [decide] = useDecideConnectSpeakerMutation();
  const [resendPhotoLink] = useResendConnectPhotoLinkMutation();
  const [sendReminders, { isLoading: sending }] = useSendConnectRemindersMutation();

  const [pendingId, setPendingId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const stats = data?.stats;

  async function run(action: () => Promise<unknown>, success: string, id?: string) {
    setPendingId(id ?? null);
    setNotice(null);
    setError(null);
    try {
      await action();
      setNotice(success);
    } catch (err) {
      const detail =
        typeof err === 'object' && err && 'data' in err
          ? ((err as { data?: { message?: string } }).data?.message ?? null)
          : null;
      setError(detail ?? 'That did not work. Please try again.');
    } finally {
      setPendingId(null);
    }
  }

  async function blast(audience: 'all' | 'speakers') {
    const who =
      audience === 'all'
        ? `all ${stats?.interested ?? 0} registrations`
        : `${stats?.speakersApproved ?? 0} approved speakers`;
    // A bulk email cannot be recalled, so it gets an explicit confirmation
    // naming exactly who it reaches.
    if (!window.confirm(`Send a reminder to ${who}?`)) return;
    await run(async () => {
      const result = await sendReminders({
        audience,
        ...(message.trim() ? { message: message.trim() } : {}),
      }).unwrap();
      setNotice(
        `Sent ${result.sent} of ${result.total}.${
          result.failed.length > 0 ? ` Failed: ${result.failed.join(', ')}` : ''
        }`,
      );
      return result;
    }, 'Reminder sent.');
  }

  const speakerColumns: DataTableColumn<ConnectRegistrationRow>[] = [
    {
      key: 'speaker',
      header: 'Speaker',
      sortValue: (row) => row.name,
      render: (row) => (
        <div className="flex items-center gap-2">
          {row.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              alt=""
              className="size-9 rounded-full object-cover"
              src={row.photoUrl}
            />
          ) : (
            <span className="flex size-9 items-center justify-center rounded-full bg-line text-[10px] font-black text-muted">
              —
            </span>
          )}
          <div>
            <p className="font-extrabold">{row.name}</p>
            <p className="text-xs text-muted">{row.email}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'topic',
      header: 'Topic',
      sortValue: (row) => row.speakerTopic ?? '',
      render: (row) => (
        <div className="max-w-md">
          <p className="font-bold">{row.speakerTopic ?? '—'}</p>
          {row.speakerSummary ? (
            <p className="mt-0.5 line-clamp-2 text-xs text-muted">{row.speakerSummary}</p>
          ) : null}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortValue: (row) => row.speakerStatus,
      render: (row) => (
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-black ${
            row.speakerStatus === 'APPROVED'
              ? 'bg-emerald-100 text-emerald-800'
              : row.speakerStatus === 'DECLINED'
                ? 'bg-red-100 text-red-800'
                : 'bg-amber-100 text-amber-800'
          }`}
        >
          {row.speakerStatus.toLowerCase()}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      searchable: false,
      render: (row) => {
        const busy = pendingId === row.id;
        if (row.speakerStatus === 'PENDING') {
          return (
            <div className="flex gap-2">
              <button
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-black text-white disabled:opacity-50"
                disabled={busy}
                onClick={() =>
                  void run(
                    () => decide({ id: row.id, decision: 'APPROVE' }).unwrap(),
                    `Approved ${row.name} and emailed their photo link.`,
                    row.id,
                  )
                }
                type="button"
              >
                Approve
              </button>
              <button
                className="rounded-lg border border-line px-3 py-1.5 text-xs font-black disabled:opacity-50"
                disabled={busy}
                onClick={() =>
                  void run(
                    () => decide({ id: row.id, decision: 'DECLINE' }).unwrap(),
                    `Declined ${row.name}.`,
                    row.id,
                  )
                }
                type="button"
              >
                Decline
              </button>
            </div>
          );
        }
        if (row.speakerStatus === 'APPROVED') {
          return (
            <button
              className="rounded-lg border border-line px-3 py-1.5 text-xs font-black disabled:opacity-50"
              disabled={busy}
              onClick={() =>
                void run(
                  () => resendPhotoLink({ id: row.id }).unwrap(),
                  `Sent a new 48-hour photo link to ${row.email}.`,
                  row.id,
                )
              }
              type="button"
            >
              {row.photoUrl ? 'Resend photo link' : 'Send photo link'}
            </button>
          );
        }
        return <span className="text-xs text-muted">—</span>;
      },
    },
  ];

  const attendeeColumns: DataTableColumn<ConnectRegistrationRow>[] = [
    {
      key: 'name',
      header: 'Name',
      sortValue: (row) => row.name,
      render: (row) => (
        <div>
          <p className="font-extrabold">{row.name}</p>
          <p className="text-xs text-muted">{row.email}</p>
        </div>
      ),
    },
    {
      key: 'country',
      header: 'Country',
      sortValue: (row) => row.countryCode,
      render: (row) => <span className="font-mono text-xs">{row.countryCode}</span>,
    },
    {
      key: 'member',
      header: 'Member',
      sortValue: (row) => (row.user ? 1 : 0),
      render: (row) =>
        row.user ? (
          <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-black text-emerald-800">
            {row.user.phoneVerifiedAt ? 'linked · SMS' : 'linked'}
          </span>
        ) : (
          <span className="text-xs text-muted">guest</span>
        ),
    },
    {
      key: 'registered',
      header: 'Registered',
      sortValue: (row) => row.createdAt,
      render: (row) => (
        <span className="text-xs text-muted">
          {new Date(row.createdAt).toLocaleDateString()}
        </span>
      ),
    },
  ];

  return (
    <AdminShell>
      <div className="grid gap-5">
        <div>
          <h1 className="text-2xl font-black">Connect 2026</h1>
          <p className="mt-1 text-sm text-muted">
            Registrations and speaker applications for the first contributor webinar. Approving a
            speaker emails them a photo-upload link that works for 48 hours.
          </p>
        </div>

        {notice ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800">
            {notice}
          </div>
        ) : null}
        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-800">
            {error}
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: 'Registered', value: stats?.interested },
            { label: 'Countries', value: stats?.countries },
            { label: 'Speakers pending', value: stats?.speakersPending },
            { label: 'Speakers approved', value: stats?.speakersApproved },
          ].map((tile) => (
            <div className="rounded-xl border border-line bg-surface p-4" key={tile.label}>
              <p className="text-xs font-bold uppercase text-muted">{tile.label}</p>
              <p className="mt-1 text-2xl font-black tabular-nums">{tile.value ?? '—'}</p>
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-line bg-surface p-4">
          <h2 className="font-black">Send a reminder</h2>
          <p className="mt-1 text-sm text-muted">
            Goes out by email. {stats?.smsReachable ?? 0} of {stats?.interested ?? 0} registrations
            are linked members with a verified phone, so only those could also be reached by SMS.
          </p>
          <textarea
            className="mt-3 w-full rounded-lg border border-line bg-bg p-3 text-sm"
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Optional note to include above the event details…"
            rows={3}
            value={message}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              className="rounded-lg bg-brand px-4 py-2 text-sm font-black text-white disabled:opacity-50"
              disabled={sending || !stats?.interested}
              onClick={() => void blast('all')}
              type="button"
            >
              Remind all registrations
            </button>
            <button
              className="rounded-lg border border-line px-4 py-2 text-sm font-black disabled:opacity-50"
              disabled={sending || !stats?.speakersApproved}
              onClick={() => void blast('speakers')}
              type="button"
            >
              Remind approved speakers
            </button>
          </div>
          <p className="mt-2 text-xs text-muted">
            Speaker reminders include each speaker&apos;s own topic. Only approved speakers are
            included &mdash; a pending or declined applicant is never told about &ldquo;your
            talk&rdquo;.
          </p>
        </div>

        <div>
          <h2 className="mb-2 font-black">Speaker applications</h2>
          <DataTable
            columns={speakerColumns}
            emptyMessage="No speaker applications yet."
            isLoading={isLoading}
            pageSize={10}
            rowKey={(row) => row.id}
            rows={data?.speakers ?? []}
          />
        </div>

        <div>
          <h2 className="mb-2 font-black">Attendees</h2>
          <DataTable
            columns={attendeeColumns}
            emptyMessage="No registrations yet."
            isLoading={isLoading}
            adjustablePageSize
            pageSize={15}
            rowKey={(row) => row.id}
            rows={data?.attendees ?? []}
          />
        </div>
      </div>
    </AdminShell>
  );
}

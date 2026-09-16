'use client';

import { type FormEvent, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown, PhoneCall, Search } from 'lucide-react';
import { AdminShell } from '@/components/admin/AdminShell';
import { ActionButton } from '@/components/ui/ActionButton';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/Dialog';
import {
  AdminWhatsAppValidationRow,
  normalizeErrorMessage,
  useForceVerifyAdminWhatsAppValidationMutation,
  useListAdminWhatsAppValidationsQuery,
  useRejectAdminWhatsAppValidationMutation,
  useVerifyAdminWhatsAppValidationMutation,
  WhatsAppValidationRequestStatus,
} from '@/store/api';

const statuses: ('ALL' | WhatsAppValidationRequestStatus)[] = [
  'PENDING',
  'CLAIMED',
  'VERIFIED',
  'REJECTED',
  'EXPIRED',
  'CANCELLED',
  'ALL',
];

export default function AdminPhoneVerificationsPage() {
  const [status, setStatus] = useState<'ALL' | WhatsAppValidationRequestStatus>('PENDING');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortColumn>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [verifyRow, setVerifyRow] = useState<AdminWhatsAppValidationRow | null>(null);
  const { data, isLoading, isFetching } = useListAdminWhatsAppValidationsQuery({
    page,
    pageSize: 10,
    search: search.trim() || undefined,
    sortBy,
    sortOrder,
    ...(status !== 'ALL' ? { status } : {}),
  });
  const rows = data?.items ?? [];

  return (
    <AdminShell>
      <div className="grid gap-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-black">Phone verifications</h1>
            <p className="mt-2 max-w-4xl text-muted">
              Every peer-to-peer WhatsApp verification request platform-wide -- who requested, who
              claimed it, and its current status. Verify with the relayed code, force-verify as an
              override, or reject, the same as before.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="grid gap-1 text-sm font-bold">
              Search
              <span className="relative">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
                  aria-hidden="true"
                />
                <input
                  className="min-h-10 w-full rounded-lg border border-line bg-white py-2 pl-9 pr-3 font-normal outline-none focus:border-accent sm:w-64"
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setPage(1);
                  }}
                  placeholder="Name, email, or phone"
                  value={search}
                />
              </span>
            </label>
            <label className="grid gap-1 text-sm font-bold">
              Status
              <select
                className="min-h-10 rounded-lg border border-line bg-white px-3"
                onChange={(event) => {
                  setStatus(event.target.value as typeof status);
                  setPage(1);
                }}
                value={status}
              >
                {statuses.map((item) => (
                  <option key={item} value={item}>
                    {item === 'ALL' ? 'All' : item.toLowerCase()}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </header>

        <section className="overflow-hidden rounded-lg border border-line bg-white shadow-[0_2px_8px_rgba(27,31,27,0.05)]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] border-collapse text-left text-sm">
              <thead className="bg-surface-muted text-xs uppercase text-muted">
                <tr>
                  <SortableHeader
                    label="Requester"
                    column="requester"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={(column) =>
                      updateSort(column, sortBy, sortOrder, setSortBy, setSortOrder, setPage)
                    }
                  />
                  <th className="px-4 py-3">Claimant</th>
                  <SortableHeader
                    label="Phone"
                    column="phone"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={(column) =>
                      updateSort(column, sortBy, sortOrder, setSortBy, setSortOrder, setPage)
                    }
                  />
                  <SortableHeader
                    label="Status"
                    column="status"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={(column) =>
                      updateSort(column, sortBy, sortOrder, setSortBy, setSortOrder, setPage)
                    }
                  />
                  <th className="px-4 py-3">Fee</th>
                  <th className="px-4 py-3">Claimed</th>
                  <SortableHeader
                    label="Created"
                    column="createdAt"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={(column) =>
                      updateSort(column, sortBy, sortOrder, setSortBy, setSortOrder, setPage)
                    }
                  />
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td className="px-4 py-10 text-center text-muted" colSpan={8}>
                      Loading requests...
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td className="px-4 py-10 text-center font-bold text-muted" colSpan={8}>
                      No WhatsApp verification requests.
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => <RequestRow key={row.id} row={row} onVerify={setVerifyRow} />)
                )}
              </tbody>
            </table>
          </div>
          <div className="flex flex-col gap-3 border-t border-line px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted">
              Page {data?.page ?? page} of {data?.totalPages ?? 1}
              {isFetching ? ' - refreshing' : ''}
            </p>
            <div className="flex gap-2">
              <button
                className="min-h-10 rounded-lg border border-line px-4 font-bold disabled:opacity-50"
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                type="button"
              >
                Previous
              </button>
              <button
                className="min-h-10 rounded-lg border border-line px-4 font-bold disabled:opacity-50"
                disabled={page >= (data?.totalPages ?? 1)}
                onClick={() => setPage((current) => current + 1)}
                type="button"
              >
                Next
              </button>
            </div>
          </div>
        </section>

        <VerifyDialog row={verifyRow} onOpenChange={(open) => !open && setVerifyRow(null)} />
      </div>
    </AdminShell>
  );
}

type SortColumn = 'requester' | 'claimant' | 'phone' | 'status' | 'createdAt';

function updateSort(
  column: SortColumn,
  currentColumn: SortColumn,
  currentOrder: 'asc' | 'desc',
  setColumn: (value: SortColumn) => void,
  setOrder: (value: 'asc' | 'desc') => void,
  setPage: (value: number) => void,
) {
  setColumn(column);
  setOrder(column === currentColumn && currentOrder === 'asc' ? 'desc' : 'asc');
  setPage(1);
}

function SortableHeader({
  label,
  column,
  sortBy,
  sortOrder,
  onSort,
}: {
  label: string;
  column: SortColumn;
  sortBy: SortColumn;
  sortOrder: 'asc' | 'desc';
  onSort: (column: SortColumn) => void;
}) {
  const active = sortBy === column;
  return (
    <th className="px-4 py-3">
      <button
        className="inline-flex items-center gap-1 font-bold uppercase hover:text-accent"
        onClick={() => onSort(column)}
        type="button"
      >
        {label}
        {active ? (
          sortOrder === 'asc' ? (
            <ArrowUp className="size-3.5" aria-hidden="true" />
          ) : (
            <ArrowDown className="size-3.5" aria-hidden="true" />
          )
        ) : (
          <ChevronsUpDown className="size-3.5 opacity-50" aria-hidden="true" />
        )}
      </button>
    </th>
  );
}

function personName(person: { email: string; firstName: string | null; lastName: string | null }) {
  return [person.firstName, person.lastName].filter(Boolean).join(' ') || person.email;
}

function RequestRow({
  row,
  onVerify,
}: {
  row: AdminWhatsAppValidationRow;
  onVerify: (row: AdminWhatsAppValidationRow) => void;
}) {
  const [reject, { isLoading: rejecting }] = useRejectAdminWhatsAppValidationMutation();
  const [error, setError] = useState<string | null>(null);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const requesterName = useMemo(() => personName(row.requester), [row.requester]);
  const claimantName = useMemo(
    () => (row.claimedByValidator ? personName(row.claimedByValidator) : null),
    [row.claimedByValidator],
  );
  const canAct = row.status === 'PENDING' || row.status === 'CLAIMED';

  async function rejectRow() {
    setError(null);
    try {
      await reject(row.id).unwrap();
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to reject request.'));
    }
  }

  return (
    <>
      <tr className="border-t border-line">
        <td className="px-4 py-3">
          <div className="font-black">{requesterName}</div>
          <div className="text-muted">{row.requester.email}</div>
        </td>
        <td className="px-4 py-3">
          {claimantName ? (
            <>
              <div className="font-black">{claimantName}</div>
              <div className="text-muted">{row.claimedByValidator?.email}</div>
            </>
          ) : (
            <span className="text-muted">Unclaimed</span>
          )}
        </td>
        <td className="px-4 py-3 font-bold">{row.phoneNumber}</td>
        <td className="px-4 py-3">
          <StatusBadge status={row.status} />
        </td>
        <td className="px-4 py-3">{row.feeTokenAmount} DL</td>
        <td className="px-4 py-3">{row.claimedAt ? formatDateTime(row.claimedAt) : 'Not claimed'}</td>
        <td className="px-4 py-3">{formatDateTime(row.createdAt)}</td>
        <td className="px-4 py-3">
          {canAct ? (
            <div className="flex flex-wrap gap-2">
              <button
                className="min-h-9 rounded-lg bg-accent px-3 font-bold text-white hover:bg-accent-dark"
                onClick={() => onVerify(row)}
                type="button"
              >
                Verify
              </button>
              <button
                aria-label="Force-verify without a code"
                className="grid min-h-9 min-w-9 place-items-center rounded-lg border border-line px-2 hover:bg-surface-muted"
                onClick={() => setConfirmDialogOpen(true)}
                title="Force-verify without the relayed code -- use only once you've confirmed the number another way."
                type="button"
              >
                <PhoneCall aria-hidden="true" className="size-4" />
              </button>
              <ActionButton
                className="min-h-9 rounded-lg border border-line px-3 font-bold hover:bg-surface-muted disabled:opacity-60"
                onClick={() => void rejectRow()}
                pending={rejecting}
                pendingLabel="Rejecting"
                type="button"
              >
                Reject
              </ActionButton>
            </div>
          ) : (
            <span className="text-muted">No action</span>
          )}
        </td>
      </tr>
      {error && (
        <tr>
          <td className="px-4 pb-3 text-danger" colSpan={8}>
            {error}
          </td>
        </tr>
      )}
      {confirmDialogOpen && (
        <ConfirmWithoutCodeDialog row={row} onClose={() => setConfirmDialogOpen(false)} />
      )}
    </>
  );
}

const BYPASS_PASSPHRASE = 'BYPASS';

/**
 * Force-verifying without the code skips the one proof that the code was
 * actually relayed peer-to-peer -- a stray click here silently marks an
 * unconfirmed number as verified (and, if a validator has claimed it,
 * still pays that validator's fee). Typing the passphrase is a deliberate,
 * hard-to-misclick gate (not a real secret), same pattern as the retired
 * ManualPhoneVerificationRequest admin flow this page used to show.
 */
function ConfirmWithoutCodeDialog({
  row,
  onClose,
}: {
  row: AdminWhatsAppValidationRow;
  onClose: () => void;
}) {
  const [passphrase, setPassphrase] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [forceVerify, { isLoading }] = useForceVerifyAdminWhatsAppValidationMutation();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await forceVerify(row.id).unwrap();
      onClose();
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to verify this number.'));
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title="Verify without a code"
        description={`Confirm you've reached ${row.phoneNumber} another way (e.g. a call). Type ${BYPASS_PASSPHRASE} to continue.${
          row.claimedByValidator ? ' The claiming validator still receives the fee payout.' : ''
        }`}
      >
        <form className="grid gap-3" onSubmit={submit}>
          <input
            autoFocus
            className="min-h-9 w-full rounded-lg border border-line bg-white px-3 py-1.5 text-sm uppercase tracking-widest text-ink dark:bg-surface-muted"
            onChange={(e) => setPassphrase(e.target.value.toUpperCase())}
            placeholder={BYPASS_PASSPHRASE}
            value={passphrase}
          />
          {error && (
            <p className="leading-relaxed text-danger" role="alert">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <DialogClose className="inline-flex min-h-9 items-center justify-center rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-bold text-ink transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60">
              Cancel
            </DialogClose>
            <ActionButton
              className="inline-flex min-h-10 items-center justify-center rounded-lg border border-line bg-accent px-3.5 py-2.5 font-bold text-white transition-colors hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60"
              disabled={passphrase !== BYPASS_PASSPHRASE}
              pending={isLoading}
              pendingLabel="Verifying"
              type="submit"
            >
              Verify
            </ActionButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function VerifyDialog({
  row,
  onOpenChange,
}: {
  row: AdminWhatsAppValidationRow | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [verify, { isLoading }] = useVerifyAdminWhatsAppValidationMutation();

  async function submit() {
    if (!row) return;
    setError(null);
    try {
      await verify({ id: row.id, code: code.trim() }).unwrap();
      setCode('');
      onOpenChange(false);
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to verify phone number.'));
    }
  }

  return (
    <Dialog open={row !== null} onOpenChange={onOpenChange}>
      <DialogContent title="Verify mobile" description="Enter the code the requester relayed.">
        {row && (
          <div className="grid gap-4">
            <div className="rounded-lg border border-line bg-surface-muted px-3 py-2 text-sm">
              <div className="font-black">{personName(row.requester)}</div>
              <div className="text-muted">{row.phoneNumber}</div>
              {row.claimedByValidator && (
                <div className="mt-1 text-xs text-muted">
                  Claimed by {personName(row.claimedByValidator)}
                </div>
              )}
            </div>
            <label className="grid gap-1.5 text-sm font-bold">
              Verification code
              <input
                className="min-h-11 rounded-lg border border-line bg-white px-3 text-center text-lg font-black uppercase tracking-[0.3em] text-ink outline-none focus:border-accent"
                maxLength={6}
                onChange={(event) =>
                  setCode(event.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 6))
                }
                value={code}
              />
            </label>
            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-danger">
                {error}
              </p>
            )}
            <ActionButton
              className="min-h-11 rounded-lg bg-accent px-5 font-extrabold text-white hover:bg-accent-dark disabled:opacity-60"
              disabled={code.length !== 6}
              onClick={() => void submit()}
              pending={isLoading}
              pendingLabel="Verifying"
              type="button"
            >
              Verify mobile
            </ActionButton>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function StatusBadge({ status }: { status: WhatsAppValidationRequestStatus }) {
  const styles: Record<WhatsAppValidationRequestStatus, string> = {
    PENDING: 'bg-amber-50 text-amber-700',
    CLAIMED: 'bg-blue-50 text-blue-700',
    VERIFIED: 'bg-emerald-50 text-emerald-700',
    REJECTED: 'bg-red-50 text-red-700',
    EXPIRED: 'bg-slate-100 text-slate-700',
    CANCELLED: 'bg-slate-100 text-slate-700',
  };
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-black ${styles[status]}`}>
      {status.toLowerCase()}
    </span>
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );
}

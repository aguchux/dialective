'use client';

import { FormEvent, useMemo, useState } from 'react';
import { AdminShell } from '@/components/admin/AdminShell';
import { DataTable, DataTableColumn } from '@/components/ui/DataTable';
import { ActionButton } from '@/components/ui/ActionButton';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/Dialog';
import {
  AdminSupportRequest,
  normalizeErrorMessage,
  useGetAdminSupportRequestsQuery,
  useUpdateAdminSupportRequestResolutionMutation,
} from '@/store/api';

export default function AdminSupportRequestsPage() {
  const [page, setPage] = useState(1);
  const [resolveRequest, setResolveRequest] = useState<AdminSupportRequest | null>(null);
  const pageSize = 25;
  const { data, isLoading } = useGetAdminSupportRequestsQuery({ page, pageSize });
  const [updateResolution] = useUpdateAdminSupportRequestResolutionMutation();

  const columns: DataTableColumn<AdminSupportRequest>[] = [
    {
      key: 'contact',
      header: 'Contact',
      sortValue: (row) => `${row.name} ${row.email}`,
      render: (row) => (
        <div className="grid gap-1">
          <p className="font-extrabold">{row.name}</p>
          <a className="text-sm font-bold text-accent hover:underline" href={`mailto:${row.email}`}>
            {row.email}
          </a>
        </div>
      ),
    },
    {
      key: 'subject',
      header: 'Subject',
      sortValue: (row) => row.subject,
      render: (row) => <span className="font-bold">{row.subject}</span>,
    },
    {
      key: 'message',
      header: 'Message',
      sortValue: (row) => row.message,
      render: (row) => (
        <p className="max-w-md whitespace-pre-line leading-relaxed text-muted">{row.message}</p>
      ),
    },
    {
      key: 'createdAt',
      header: 'Submitted',
      sortValue: (row) => row.createdAt,
      render: (row) => <span>{new Date(row.createdAt).toLocaleString()}</span>,
      searchable: false,
    },
    {
      key: 'status',
      header: 'Status',
      sortValue: (row) => row.resolvedAt ?? '',
      render: (row) => (
        <div className="grid gap-1">
          <span
            className={`inline-flex w-fit rounded-full px-2 py-1 text-xs font-bold ${row.resolvedAt ? 'bg-accent-soft text-accent-dark' : 'bg-[#fff3e0] text-[#8a4b0f]'}`}
          >
            {row.resolvedAt ? 'Resolved' : 'Pending'}
          </span>
          {row.resolvedAt && (
            <span className="text-xs text-muted">{new Date(row.resolvedAt).toLocaleString()}</span>
          )}
        </div>
      ),
      searchable: false,
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (row) => (
        <button
          className="inline-flex min-h-9 items-center justify-center rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-bold text-ink transition-colors hover:bg-surface-muted"
          onClick={() => setResolveRequest(row)}
          type="button"
        >
          {row.resolvedAt ? 'Update note' : 'Mark resolved'}
        </button>
      ),
      searchable: false,
    },
  ];

  const pageRows = useMemo(() => data?.items ?? [], [data?.items]);

  return (
    <AdminShell>
      <div className="grid gap-6">
        <div className="grid gap-2">
          <h1 className="text-3xl font-black">Support Requests</h1>
          <p className="leading-relaxed text-muted">
            Messages submitted from the public Contact Us form.
          </p>
        </div>

        <DataTable
          columns={columns}
          rows={pageRows}
          rowKey={(row) => row.id}
          isLoading={isLoading}
          emptyMessage="No support requests yet."
          searchPlaceholder="Search name, email, or subject"
          pageSize={25}
        />

        <div className="flex items-center justify-between gap-3 rounded-lg border border-line bg-white p-3">
          <p className="text-sm text-muted">
            Page {data?.page ?? page} of {data?.totalPages ?? 1} · {data?.total ?? 0} total
          </p>
          <div className="flex gap-2">
            <button
              className="inline-flex min-h-8 items-center justify-center rounded-lg border border-line bg-surface px-3 text-sm font-bold text-ink transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
              disabled={page <= 1 || isLoading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              type="button"
            >
              Previous
            </button>
            <button
              className="inline-flex min-h-8 items-center justify-center rounded-lg border border-line bg-surface px-3 text-sm font-bold text-ink transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isLoading || (data ? page >= data.totalPages : true)}
              onClick={() => setPage((p) => p + 1)}
              type="button"
            >
              Next
            </button>
          </div>
        </div>

        {resolveRequest && (
          <ResolveSupportRequestDialog
            request={resolveRequest}
            onClose={() => setResolveRequest(null)}
            onSubmit={async (payload) => {
              await updateResolution({ id: resolveRequest.id, body: payload }).unwrap();
              setResolveRequest(null);
            }}
          />
        )}
      </div>
    </AdminShell>
  );
}

function ResolveSupportRequestDialog({
  request,
  onClose,
  onSubmit,
}: {
  request: AdminSupportRequest;
  onClose: () => void;
  onSubmit: (payload: { resolved: boolean; note?: string }) => Promise<void>;
}) {
  const [resolved, setResolved] = useState(Boolean(request.resolvedAt));
  const [note, setNote] = useState(request.resolutionNote ?? '');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSaving(true);
    try {
      await onSubmit({ resolved, note: note.trim() || undefined });
    } catch (mutationError) {
      setError(normalizeErrorMessage(mutationError, 'Unable to update this request.'));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title="Support request follow-up"
        description={`Update status for ${request.name} (${request.email}) — "${request.subject}".`}
      >
        <form className="grid gap-3" onSubmit={handleSubmit}>
          <label className="flex items-start gap-2 rounded-lg border border-line bg-surface p-3 text-sm font-bold">
            <input
              checked={resolved}
              className="mt-1"
              onChange={(e) => setResolved(e.target.checked)}
              type="checkbox"
            />
            Mark this request as resolved
          </label>

          <div className="grid gap-1">
            <label className="text-xs font-bold uppercase text-muted" htmlFor="resolution-note">
              Internal note (optional)
            </label>
            <textarea
              className="min-h-24 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink"
              id="resolution-note"
              maxLength={2000}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Replied by email on 12 Aug"
              value={note}
            />
          </div>

          {error && (
            <p className="text-sm text-danger" role="alert">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <DialogClose className="inline-flex min-h-9 items-center justify-center rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-bold text-ink transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60">
              Cancel
            </DialogClose>
            <ActionButton
              className="inline-flex min-h-10 items-center justify-center rounded-lg border border-accent bg-accent px-3.5 py-2.5 font-bold text-white transition-colors hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60"
              pending={isSaving}
              pendingLabel="Saving"
              type="submit"
            >
              Save
            </ActionButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

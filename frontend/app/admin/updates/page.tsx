'use client';

import { FormEvent, useState } from 'react';
import { Pencil, Plus, Send, Trash2 } from 'lucide-react';
import { AdminShell } from '@/components/admin/AdminShell';
import { ActionButton } from '@/components/ui/ActionButton';
import { DataTable, DataTableColumn } from '@/components/ui/DataTable';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/Dialog';
import {
  AdminSystemUpdate,
  SystemUpdateKind,
  normalizeErrorMessage,
  useCreateSystemUpdateMutation,
  useDeleteSystemUpdateMutation,
  useGetAdminSystemUpdatesQuery,
  useUpdateSystemUpdateMutation,
} from '@/store/api';
import { formatDateTime } from '@/components/dashboard/shared';

const kinds: { value: SystemUpdateKind; label: string; description: string }[] = [
  {
    value: 'MESSAGE',
    label: 'Message',
    description: 'General inbox message for all active users.',
  },
  {
    value: 'MAINTENANCE',
    label: 'Maintenance',
    description: 'Platform maintenance or outage notice for all active users.',
  },
  {
    value: 'BLOG',
    label: 'Blog',
    description: 'Manual blog/news alert for users opted into Blog & News.',
  },
  {
    value: 'COURSE',
    label: 'Course',
    description: 'Manual course alert for users opted into Courses.',
  },
];

const kindStyles: Record<SystemUpdateKind, string> = {
  MESSAGE: 'bg-accent-soft text-accent-dark',
  MAINTENANCE: 'bg-[#fff3e0] text-[#8a4b0f]',
  BLOG: 'bg-[#e8f0fe] text-[#1a56db]',
  COURSE: 'bg-[#e6f6ec] text-[#0f7a3d]',
};

const inputClass =
  'min-h-11 rounded-lg border border-line bg-white px-3 font-bold outline-none focus:border-accent';
const primaryButtonClass =
  'inline-flex min-h-10 items-center justify-center rounded-lg border border-accent bg-accent px-3.5 py-2.5 font-bold text-white transition-colors hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60';
const secondaryButtonClass =
  'inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-bold text-ink transition-colors hover:bg-surface-muted';

export default function AdminUpdatesPage() {
  const { data: updates, isLoading } = useGetAdminSystemUpdatesQuery();
  const [deleteUpdate] = useDeleteSystemUpdateMutation();
  const [isAdding, setIsAdding] = useState(false);
  const [editingUpdate, setEditingUpdate] = useState<AdminSystemUpdate | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete(update: AdminSystemUpdate) {
    if (!window.confirm(`Delete "${update.title}"? This removes it from every recipient's inbox.`))
      return;
    setError(null);
    setPendingDeleteId(update.id);
    try {
      await deleteUpdate(update.id).unwrap();
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to delete this update.'));
    } finally {
      setPendingDeleteId(null);
    }
  }

  const columns: DataTableColumn<AdminSystemUpdate>[] = [
    {
      key: 'title',
      header: 'Update',
      sortValue: (u) => u.title,
      render: (u) => (
        <>
          <p className="font-extrabold">{u.title}</p>
          <p className="line-clamp-2 max-w-md text-sm text-muted">{u.message}</p>
        </>
      ),
    },
    {
      key: 'kind',
      header: 'Type',
      sortValue: (u) => u.kind,
      render: (u) => (
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-black uppercase ${kindStyles[u.kind]}`}
        >
          {u.kind}
        </span>
      ),
    },
    {
      key: 'read',
      header: 'Read',
      sortValue: (u) => (u._count.notifications === 0 ? 0 : u.readCount / u._count.notifications),
      render: (u) => (
        <>
          <p className="font-extrabold">
            {u.readCount.toLocaleString()} / {u._count.notifications.toLocaleString()}
          </p>
          <p className="text-xs text-muted">
            {u._count.notifications === 0
              ? 'No recipients'
              : `${Math.round((u.readCount / u._count.notifications) * 100)}% read`}
          </p>
        </>
      ),
    },
    {
      key: 'createdAt',
      header: 'Sent',
      sortValue: (u) => u.createdAt,
      render: (u) => <span className="text-sm text-muted">{formatDateTime(u.createdAt)}</span>,
    },
    {
      key: 'actions',
      header: 'Actions',
      searchable: false,
      render: (u) => (
        <div className="flex flex-wrap items-center gap-2">
          <button
            className={secondaryButtonClass}
            onClick={() => setEditingUpdate(u)}
            type="button"
          >
            <Pencil className="size-3.5" aria-hidden="true" /> Edit
          </button>
          <ActionButton
            className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-bold text-danger transition-colors hover:bg-[#fde8e8] disabled:cursor-not-allowed disabled:opacity-60"
            onClick={() => handleDelete(u)}
            pending={pendingDeleteId === u.id}
            pendingLabel="Deleting"
            type="button"
          >
            <Trash2 className="size-3.5" aria-hidden="true" /> Delete
          </ActionButton>
        </div>
      ),
    },
  ];

  return (
    <AdminShell>
      <div className="grid gap-6">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-black">Updates</h1>
            <p className="mt-1 text-muted">Send platform updates into user notification inboxes.</p>
          </div>
          <button
            className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-accent px-5 font-extrabold text-white hover:bg-accent-dark"
            onClick={() => setIsAdding(true)}
            type="button"
          >
            <Plus className="size-4" aria-hidden="true" />
            Add update
          </button>
        </header>

        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 font-bold text-danger">
            {error}
          </p>
        )}

        <DataTable
          columns={columns}
          rows={updates ?? []}
          rowKey={(u) => u.id}
          isLoading={isLoading}
          emptyMessage="No updates have been sent yet."
          searchPlaceholder="Search title or message"
        />
      </div>

      {isAdding && <AddUpdateDialog onClose={() => setIsAdding(false)} />}
      {editingUpdate && (
        <EditUpdateDialog onClose={() => setEditingUpdate(null)} update={editingUpdate} />
      )}
    </AdminShell>
  );
}

function AddUpdateDialog({ onClose }: { onClose: () => void }) {
  const [createUpdate, { isLoading: isSending }] = useCreateSystemUpdateMutation();
  const [kind, setKind] = useState<SystemUpdateKind>('MESSAGE');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [href, setHref] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setNotice(null);
    setError(null);
    try {
      const result = await createUpdate({
        kind,
        title: title.trim(),
        message: message.trim(),
        ...(href.trim() ? { href: href.trim() } : {}),
      }).unwrap();
      setNotice(
        `Update sent to ${result.recipients.toLocaleString()} recipient${result.recipients === 1 ? '' : 's'}.`,
      );
      setTitle('');
      setMessage('');
      setHref('');
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to send this update.'));
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title="Send a new update"
        description="Delivered into every eligible recipient's notification inbox."
      >
        <form className="grid gap-4" onSubmit={submit}>
          <div className="grid gap-2">
            <label className="text-xs font-black uppercase text-muted" htmlFor="update-kind">
              Update type
            </label>
            <select
              className={inputClass}
              id="update-kind"
              onChange={(event) => setKind(event.target.value as SystemUpdateKind)}
              value={kind}
            >
              {kinds.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
            <p className="text-sm text-muted">
              {kinds.find((item) => item.value === kind)?.description}
            </p>
          </div>
          <div className="grid gap-2">
            <label className="text-xs font-black uppercase text-muted" htmlFor="update-title">
              Title
            </label>
            <input
              className={inputClass}
              id="update-title"
              maxLength={160}
              onChange={(event) => setTitle(event.target.value)}
              required
              value={title}
            />
          </div>
          <div className="grid gap-2">
            <label className="text-xs font-black uppercase text-muted" htmlFor="update-message">
              Message
            </label>
            <textarea
              className="min-h-32 resize-y rounded-lg border border-line bg-white px-3 py-3 font-medium outline-none focus:border-accent"
              id="update-message"
              maxLength={2000}
              onChange={(event) => setMessage(event.target.value)}
              required
              value={message}
            />
          </div>
          <div className="grid gap-2">
            <label className="text-xs font-black uppercase text-muted" htmlFor="update-link">
              Related link
            </label>
            <input
              className={inputClass}
              id="update-link"
              onChange={(event) => setHref(event.target.value)}
              placeholder="/blog/example or /learn/course"
              value={href}
            />
          </div>
          {notice && (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 font-bold text-emerald-700">
              {notice}
            </p>
          )}
          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 font-bold text-danger">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <DialogClose className="inline-flex min-h-10 items-center justify-center rounded-lg border border-line bg-surface px-4 font-bold text-ink transition-colors hover:bg-surface-muted">
              {notice ? 'Done' : 'Cancel'}
            </DialogClose>
            <ActionButton
              className={`${primaryButtonClass} gap-2`}
              pending={isSending}
              pendingLabel="Sending"
              type="submit"
            >
              <Send className="size-4" aria-hidden="true" />
              Send update
            </ActionButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditUpdateDialog({ update, onClose }: { update: AdminSystemUpdate; onClose: () => void }) {
  const [editUpdate, { isLoading: isSaving }] = useUpdateSystemUpdateMutation();
  const [title, setTitle] = useState(update.title);
  const [message, setMessage] = useState(update.message);
  const [href, setHref] = useState(update.href ?? '');
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await editUpdate({
        id: update.id,
        title: title.trim(),
        message: message.trim(),
        href: href.trim(),
      }).unwrap();
      onClose();
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to save this update.'));
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title="Edit update"
        description="Changes apply to this update everywhere it already appears -- recipients are not re-notified."
      >
        <form className="grid gap-4" onSubmit={submit}>
          <div className="grid gap-2">
            <label className="text-xs font-black uppercase text-muted" htmlFor="edit-update-title">
              Title
            </label>
            <input
              className={inputClass}
              id="edit-update-title"
              maxLength={160}
              onChange={(event) => setTitle(event.target.value)}
              required
              value={title}
            />
          </div>
          <div className="grid gap-2">
            <label
              className="text-xs font-black uppercase text-muted"
              htmlFor="edit-update-message"
            >
              Message
            </label>
            <textarea
              className="min-h-32 resize-y rounded-lg border border-line bg-white px-3 py-3 font-medium outline-none focus:border-accent"
              id="edit-update-message"
              maxLength={2000}
              onChange={(event) => setMessage(event.target.value)}
              required
              value={message}
            />
          </div>
          <div className="grid gap-2">
            <label className="text-xs font-black uppercase text-muted" htmlFor="edit-update-link">
              Related link
            </label>
            <input
              className={inputClass}
              id="edit-update-link"
              onChange={(event) => setHref(event.target.value)}
              placeholder="/blog/example or /learn/course"
              value={href}
            />
          </div>
          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 font-bold text-danger">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <DialogClose className="inline-flex min-h-10 items-center justify-center rounded-lg border border-line bg-surface px-4 font-bold text-ink transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60">
              Cancel
            </DialogClose>
            <ActionButton
              className={primaryButtonClass}
              pending={isSaving}
              pendingLabel="Saving"
              type="submit"
            >
              Save changes
            </ActionButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

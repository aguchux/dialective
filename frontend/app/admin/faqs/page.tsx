'use client';

import { useState } from 'react';
import { Eye, EyeOff, Pencil, Plus, Trash2 } from 'lucide-react';
import { AdminShell } from '@/components/admin/AdminShell';
import { FaqEditorDialog } from '@/components/admin/FaqEditorDialog';
import { formatDateTime } from '@/components/dashboard/shared';
import { DataTable, DataTableColumn } from '@/components/ui/DataTable';
import { ActionButton } from '@/components/ui/ActionButton';
import {
  AdminFaq,
  normalizeErrorMessage,
  useDeleteFaqMutation,
  useGetAdminFaqsQuery,
  useUpdateFaqMutation,
} from '@/store/api';

const iconButtonClass =
  'grid size-9 place-items-center rounded-lg border border-line bg-white text-ink transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50';

export default function AdminFaqsPage() {
  const { data: faqs = [], isLoading, isError, refetch } = useGetAdminFaqsQuery();
  const [updateFaq] = useUpdateFaqMutation();
  const [deleteFaq] = useDeleteFaqMutation();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AdminFaq | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggleVisibility(faq: AdminFaq) {
    setError(null);
    setPendingId(faq.id);
    try {
      await updateFaq({ id: faq.id, body: { visible: !faq.visible } }).unwrap();
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to update FAQ visibility.'));
    } finally {
      setPendingId(null);
    }
  }

  async function removeFaq(faq: AdminFaq) {
    if (!window.confirm(`Delete the FAQ “${faq.question}”? This cannot be undone.`)) return;
    setError(null);
    setPendingId(faq.id);
    try {
      await deleteFaq(faq.id).unwrap();
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to delete this FAQ.'));
    } finally {
      setPendingId(null);
    }
  }

  const columns: DataTableColumn<AdminFaq>[] = [
    {
      key: 'question',
      header: 'Question',
      render: (faq) => <p className="max-w-xl font-extrabold">{faq.question}</p>,
      sortValue: (faq) => faq.question,
    },
    {
      key: 'answer',
      header: 'Answer',
      render: (faq) => <p className="line-clamp-2 max-w-xl text-muted">{faq.answer}</p>,
      sortValue: (faq) => faq.answer,
    },
    {
      key: 'status',
      header: 'Status',
      render: (faq) => (
        <span
          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-black ${
            faq.visible ? 'bg-emerald-100 text-emerald-800' : 'bg-surface-muted text-muted'
          }`}
        >
          {faq.visible ? 'Visible' : 'Hidden'}
        </span>
      ),
      sortValue: (faq) => (faq.visible ? 'visible' : 'hidden'),
    },
    {
      key: 'updated',
      header: 'Updated',
      render: (faq) => <span className="text-sm text-muted">{formatDateTime(faq.updatedAt)}</span>,
      sortValue: (faq) => faq.updatedAt,
    },
    {
      key: 'actions',
      header: 'Actions',
      searchable: false,
      render: (faq) => (
        <div className="flex justify-end gap-2">
          <button
            aria-label={`Edit ${faq.question}`}
            className={iconButtonClass}
            disabled={pendingId === faq.id}
            onClick={() => setEditing(faq)}
            title="Edit FAQ"
            type="button"
          >
            <Pencil className="size-4" aria-hidden="true" />
          </button>
          <button
            aria-label={faq.visible ? `Hide ${faq.question}` : `Show ${faq.question}`}
            className={iconButtonClass}
            disabled={pendingId === faq.id}
            onClick={() => void toggleVisibility(faq)}
            title={faq.visible ? 'Hide FAQ' : 'Show FAQ'}
            type="button"
          >
            {faq.visible ? (
              <EyeOff className="size-4" aria-hidden="true" />
            ) : (
              <Eye className="size-4" aria-hidden="true" />
            )}
          </button>
          <button
            aria-label={`Delete ${faq.question}`}
            className={`${iconButtonClass} text-danger hover:bg-red-50`}
            disabled={pendingId === faq.id}
            onClick={() => void removeFaq(faq)}
            title="Delete FAQ"
            type="button"
          >
            <Trash2 className="size-4" aria-hidden="true" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <AdminShell>
      <div className="grid gap-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black">FAQs Manager</h1>
            <p className="mt-1 max-w-2xl leading-relaxed text-muted">
              Publish, hide, edit, and remove the public answers used by trainers and the AI
              assistant.
            </p>
          </div>
          <ActionButton
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-accent bg-accent px-3.5 py-2.5 font-bold text-white hover:bg-accent-dark"
            onClick={() => setCreating(true)}
            type="button"
          >
            <Plus className="size-4" aria-hidden="true" />
            Create FAQ
          </ActionButton>
        </header>

        {error && (
          <p
            className="rounded-lg border border-danger/30 bg-danger/5 p-4 font-bold text-danger"
            role="alert"
          >
            {error}
          </p>
        )}

        {isError ? (
          <section className="grid justify-items-start gap-3 rounded-lg border border-line bg-white p-5">
            <p className="font-bold">Could not load FAQs.</p>
            <button className={iconButtonClass} onClick={() => void refetch()} type="button">
              Retry
            </button>
          </section>
        ) : (
          <DataTable
            columns={columns}
            emptyMessage="No FAQs have been created yet."
            isLoading={isLoading}
            pageSize={10}
            rowKey={(faq) => faq.id}
            rows={faqs}
            searchPlaceholder="Search questions or answers..."
          />
        )}
      </div>

      <FaqEditorDialog open={creating} onOpenChange={setCreating} />
      <FaqEditorDialog
        faq={editing}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        open={Boolean(editing)}
      />
    </AdminShell>
  );
}

'use client';

import { useState } from 'react';
import { Keyboard } from 'lucide-react';
import { DataTable, DataTableColumn } from '@/components/ui/DataTable';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/Dialog';
import { ActionButton } from '@/components/ui/ActionButton';
import {
  AdminDialect,
  normalizeErrorMessage,
  useDeleteDialectMutation,
  useGenerateDialectKeyboardLayoutMutation,
  useUpdateDialectMutation,
} from '@/store/api';

const inputClass = 'min-h-10 w-full rounded-lg border border-line bg-white px-3 py-2.5 text-ink dark:bg-surface-muted';
const primaryButtonClass =
  'inline-flex min-h-10 items-center justify-center rounded-lg border border-accent bg-accent px-3.5 py-2.5 font-bold text-white transition-colors hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60';
const secondaryButtonClass =
  'inline-flex min-h-9 items-center justify-center rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-bold text-ink transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60';
const dangerButtonClass =
  'inline-flex min-h-9 items-center justify-center rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-bold text-danger transition-colors hover:bg-[#fde8e8] disabled:cursor-not-allowed disabled:opacity-60';

/**
 * Dialect table + row actions (word-gen toggle, keyboard editor, delete),
 * extracted so it can render either every dialect (the flat Coverage page)
 * or a single country's dialects (admin/geo/countries/[id]) without
 * duplicating the word-gen-toggle/keyboard-dialog logic.
 */
export function DialectsTable({ dialects, isLoading }: { dialects: AdminDialect[] | undefined; isLoading: boolean }) {
  const [deleteDialect] = useDeleteDialectMutation();
  const [updateDialect] = useUpdateDialectMutation();
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [editingKeyboardFor, setEditingKeyboardFor] = useState<AdminDialect | null>(null);

  async function handleDelete(id: string) {
    setError(null);
    setDeletingId(id);
    try {
      await deleteDialect(id).unwrap();
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to delete dialect.'));
    } finally {
      setDeletingId(null);
    }
  }

  async function handleToggleGeneration(id: string, llmGenerationEnabled: boolean) {
    setError(null);
    setTogglingId(id);
    try {
      await updateDialect({ id, body: { llmGenerationEnabled } }).unwrap();
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to update word generation coverage.'));
    } finally {
      setTogglingId(null);
    }
  }

  const columns: DataTableColumn<AdminDialect>[] = [
    {
      key: 'name',
      header: 'Dialect',
      sortValue: (d) => d.name,
      render: (d) => (
        <p className="font-extrabold">
          {d.name} <span className="text-muted">({d.tag})</span>
        </p>
      ),
    },
    {
      key: 'country',
      header: 'Country',
      sortValue: (d) => d.country.name,
      render: (d) => d.country.name,
    },
    {
      key: 'users',
      header: 'Users',
      sortValue: (d) => d._count.users,
      render: (d) => d._count.users,
    },
    {
      key: 'wordGeneration',
      header: 'Word generation',
      sortValue: (d) => (d.llmGenerationEnabled ? 1 : 0),
      render: (d) => (
        <label className="flex items-center gap-2 text-sm font-bold" title="Also requires word generation enabled on the parent country">
          <input
            checked={d.llmGenerationEnabled}
            className="size-4 accent-accent"
            disabled={togglingId === d.id}
            onChange={(e) => handleToggleGeneration(d.id, e.target.checked)}
            type="checkbox"
          />
          {d.llmGenerationEnabled ? 'Enabled' : 'Disabled'}
        </label>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (d) => (
        <div className="flex flex-wrap gap-2">
          <button className={secondaryButtonClass} onClick={() => setEditingKeyboardFor(d)} type="button">
            <Keyboard className="mr-1.5 inline size-4" aria-hidden="true" />
            Keyboard
          </button>
          <ActionButton
            className={dangerButtonClass}
            onClick={() => handleDelete(d.id)}
            disabled={d._count.users > 0}
            pending={deletingId === d.id}
            pendingLabel="Deleting"
            title={d._count.users > 0 ? 'Reassign users first' : undefined}
            type="button"
          >
            Delete
          </ActionButton>
        </div>
      ),
    },
  ];

  return (
    <section className="grid gap-4">
      {error && (
        <p className="leading-relaxed text-danger" role="alert">
          {error}
        </p>
      )}

      <DataTable
        columns={columns}
        rows={dialects ?? []}
        rowKey={(d) => d.id}
        isLoading={isLoading}
        emptyMessage="No dialects yet."
        searchPlaceholder="Search dialects..."
      />

      {editingKeyboardFor && (
        <EditKeyboardLayoutDialog dialect={editingKeyboardFor} onClose={() => setEditingKeyboardFor(null)} />
      )}
    </section>
  );
}

function EditKeyboardLayoutDialog({ dialect, onClose }: { dialect: AdminDialect; onClose: () => void }) {
  const [layout, setLayout] = useState(dialect.keyboardLayout ?? '');
  const [error, setError] = useState<string | null>(null);
  const [updateDialect, { isLoading: isSaving }] = useUpdateDialectMutation();
  const [generateLayout, { isLoading: isGenerating }] = useGenerateDialectKeyboardLayoutMutation();

  async function handleGenerate() {
    setError(null);
    try {
      const result = await generateLayout(dialect.id).unwrap();
      setLayout(result.keyboardLayout);
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to generate a suggested keyboard layout.'));
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await updateDialect({ id: dialect.id, body: { keyboardLayout: layout } }).unwrap();
      onClose();
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to save the keyboard layout.'));
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title={`${dialect.name} keyboard layout`}
        description="Space-separated characters/diacritics shown as the inline virtual keyboard during word training. Leave empty to hide the keyboard for this dialect."
      >
        <form className="grid gap-3" onSubmit={handleSave}>
          <div className="grid gap-1">
            <label className="text-xs font-bold uppercase text-muted" htmlFor="dialect-keyboard-layout">
              Characters
            </label>
            <textarea
              className={`${inputClass} min-h-24 resize-y font-mono`}
              id="dialect-keyboard-layout"
              onChange={(e) => setLayout(e.target.value)}
              placeholder="á à â ã ā ç ñ ..."
              value={layout}
            />
          </div>
          <div>
            <ActionButton
              className={secondaryButtonClass}
              onClick={handleGenerate}
              pending={isGenerating}
              pendingLabel="Generating"
              type="button"
            >
              Generate suggested keyboard
            </ActionButton>
          </div>
          {error && (
            <p className="leading-relaxed text-danger" role="alert">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <DialogClose className={secondaryButtonClass}>Cancel</DialogClose>
            <ActionButton className={primaryButtonClass} type="submit" pending={isSaving} pendingLabel="Saving">
              Save
            </ActionButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

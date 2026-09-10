'use client';

import { useState } from 'react';
import { Keyboard, Layers } from 'lucide-react';
import { DataTable, DataTableColumn } from '@/components/ui/DataTable';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/Dialog';
import { ActionButton } from '@/components/ui/ActionButton';
import {
  AdminDialect,
  AdminDialectVariant,
  normalizeErrorMessage,
  useCreateDialectVariantMutation,
  useDeleteDialectMutation,
  useDeleteDialectVariantMutation,
  useGenerateDialectKeyboardLayoutMutation,
  useGetAdminDialectVariantsQuery,
  useGetPlatformSettingsQuery,
  useUpdateDialectMutation,
  useUpdateDialectVariantMutation,
} from '@/store/api';

const inputClass =
  'min-h-10 w-full rounded-lg border border-line bg-white px-3 py-2.5 text-ink dark:bg-surface-muted';
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
export function DialectsTable({
  dialects,
  isLoading,
}: {
  dialects: AdminDialect[] | undefined;
  isLoading: boolean;
}) {
  const [deleteDialect] = useDeleteDialectMutation();
  const [updateDialect] = useUpdateDialectMutation();
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [availabilityId, setAvailabilityId] = useState<string | null>(null);
  const [editingKeyboardFor, setEditingKeyboardFor] = useState<AdminDialect | null>(null);
  const [editingVariantsFor, setEditingVariantsFor] = useState<AdminDialect | null>(null);

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

  async function handleToggleAvailability(id: string, active: boolean) {
    setError(null);
    setAvailabilityId(id);
    try {
      await updateDialect({ id, body: { active } }).unwrap();
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to update dialect availability.'));
    } finally {
      setAvailabilityId(null);
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
      key: 'availability',
      header: 'Availability',
      sortValue: (d) => (d.active ? 1 : 0),
      render: (d) => (
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-bold ${
            d.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
          }`}
        >
          {d.active ? 'Active' : 'Revoked'}
        </span>
      ),
    },
    {
      key: 'wordGeneration',
      header: 'Word generation',
      sortValue: (d) => (d.llmGenerationEnabled ? 1 : 0),
      render: (d) => (
        <label
          className="flex items-center gap-2 text-sm font-bold"
          title="Also requires word generation enabled on the parent country"
        >
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
          <button
            className={secondaryButtonClass}
            onClick={() => setEditingKeyboardFor(d)}
            type="button"
          >
            <Keyboard className="mr-1.5 inline size-4" aria-hidden="true" />
            Keyboard
          </button>
          <button
            className={secondaryButtonClass}
            onClick={() => setEditingVariantsFor(d)}
            type="button"
          >
            <Layers className="mr-1.5 inline size-4" aria-hidden="true" />
            Variants
          </button>
          <ActionButton
            className={d.active ? dangerButtonClass : secondaryButtonClass}
            onClick={() => handleToggleAvailability(d.id, !d.active)}
            pending={availabilityId === d.id}
            pendingLabel={d.active ? 'Revoking' : 'Restoring'}
            title={
              d.active
                ? 'Revoking resets every assigned trainer so they must choose an active dialect again.'
                : 'Restore this dialect for future selections.'
            }
            type="button"
          >
            {d.active ? 'Revoke' : 'Restore'}
          </ActionButton>
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
        <EditKeyboardLayoutDialog
          dialect={editingKeyboardFor}
          onClose={() => setEditingKeyboardFor(null)}
        />
      )}
      {editingVariantsFor && (
        <DialectVariantsDialog
          dialect={editingVariantsFor}
          onClose={() => setEditingVariantsFor(null)}
        />
      )}
    </section>
  );
}

function EditKeyboardLayoutDialog({
  dialect,
  onClose,
}: {
  dialect: AdminDialect;
  onClose: () => void;
}) {
  const [layout, setLayout] = useState(dialect.keyboardLayout ?? '');
  const [error, setError] = useState<string | null>(null);
  const [updateDialect, { isLoading: isSaving }] = useUpdateDialectMutation();
  const [generateLayout, { isLoading: isGenerating }] = useGenerateDialectKeyboardLayoutMutation();
  const { data: settings } = useGetPlatformSettingsQuery();
  const maxLength = settings?.keyboardLayoutMaxLength ?? 1000;

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
            <label
              className="text-xs font-bold uppercase text-muted"
              htmlFor="dialect-keyboard-layout"
            >
              Characters
            </label>
            <textarea
              className={`${inputClass} min-h-24 resize-y font-mono`}
              id="dialect-keyboard-layout"
              maxLength={maxLength}
              onChange={(e) => setLayout(e.target.value)}
              placeholder="á à â ã ā ç ñ ..."
              value={layout}
            />
            <p className="text-right text-xs text-muted">
              {layout.length} / {maxLength}
            </p>
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
            <ActionButton
              className={primaryButtonClass}
              type="submit"
              pending={isSaving}
              pendingLabel="Saving"
            >
              Save
            </ActionButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Sub-dialects under one dialect (e.g. Izzi/Ezza/Ezeagu under Igbo, plus a
 * seeded "Basic <Name>" variant every dialect always has) -- shares the
 * parent dialect's entire prompt/word/keyboard/ASR setup, so this dialog
 * only manages the tag/name label and shows how much tagged activity each
 * variant has (users onboarded under it, recordings), not a separate
 * content pool.
 */
function DialectVariantsDialog({
  dialect,
  onClose,
}: {
  dialect: AdminDialect;
  onClose: () => void;
}) {
  const { data: variants, isLoading } = useGetAdminDialectVariantsQuery(dialect.id);
  const [createVariant, { isLoading: isCreating }] = useCreateDialectVariantMutation();
  const [updateVariant] = useUpdateDialectVariantMutation();
  const [deleteVariant] = useDeleteDialectVariantMutation();

  const [tag, setTag] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTag, setEditTag] = useState('');
  const [editName, setEditName] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [availabilityId, setAvailabilityId] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await createVariant({
        dialectId: dialect.id,
        body: { tag: tag.trim(), name: name.trim() },
      }).unwrap();
      setTag('');
      setName('');
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to add this variant.'));
    }
  }

  function startEdit(variant: AdminDialectVariant) {
    setEditingId(variant.id);
    setEditTag(variant.tag);
    setEditName(variant.name);
  }

  async function handleSaveEdit(id: string) {
    setError(null);
    setSavingId(id);
    try {
      await updateVariant({
        id,
        dialectId: dialect.id,
        body: { tag: editTag.trim(), name: editName.trim() },
      }).unwrap();
      setEditingId(null);
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to save this variant.'));
    } finally {
      setSavingId(null);
    }
  }

  async function handleDelete(id: string) {
    setError(null);
    setDeletingId(id);
    try {
      await deleteVariant({ id, dialectId: dialect.id }).unwrap();
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to remove this variant.'));
    } finally {
      setDeletingId(null);
    }
  }

  async function handleToggleAvailability(id: string, active: boolean) {
    setError(null);
    setAvailabilityId(id);
    try {
      await updateVariant({ id, dialectId: dialect.id, body: { active } }).unwrap();
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to update sub-dialect availability.'));
    } finally {
      setAvailabilityId(null);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title={`${dialect.name} variants`}
        description="Sub-dialects that share this dialect's prompts, words, and ASR model -- variant only labels which trainer/recording came from which variety."
      >
        <div className="grid gap-3">
          {isLoading && <p className="text-sm text-muted">Loading...</p>}
          {!isLoading && variants && variants.length === 0 && (
            <p className="text-sm text-muted">No variants yet. Add one below.</p>
          )}
          {!isLoading && variants && variants.length > 0 && (
            <ul className="grid gap-2">
              {variants.map((variant) => (
                <li className="rounded-lg border border-line bg-surface p-3" key={variant.id}>
                  {editingId === variant.id ? (
                    <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-center">
                      <input
                        className={inputClass}
                        onChange={(e) => setEditName(e.target.value)}
                        placeholder="Name"
                        value={editName}
                      />
                      <input
                        className={`${inputClass} font-mono`}
                        onChange={(e) => setEditTag(e.target.value)}
                        placeholder="tag"
                        value={editTag}
                      />
                      <ActionButton
                        className={secondaryButtonClass}
                        onClick={() => handleSaveEdit(variant.id)}
                        pending={savingId === variant.id}
                        pendingLabel="Saving"
                        type="button"
                      >
                        Save
                      </ActionButton>
                      <button
                        className={secondaryButtonClass}
                        onClick={() => setEditingId(null)}
                        type="button"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-extrabold">
                          {variant.name}{' '}
                          <span className="font-mono text-muted">({variant.tag})</span>
                        </p>
                        <p className="text-sm text-muted">
                          <span className={variant.active ? 'text-emerald-700' : 'text-slate-600'}>
                            {variant.active ? 'Active' : 'Revoked'}
                          </span>{' '}
                          &middot; {variant._count.users} user
                          {variant._count.users === 1 ? '' : 's'}{' '}
                          &middot; {variant._count.wordRecordings} word recording
                          {variant._count.wordRecordings === 1 ? '' : 's'}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          className={secondaryButtonClass}
                          onClick={() => startEdit(variant)}
                          type="button"
                        >
                          Edit
                        </button>
                        <ActionButton
                          className={variant.active ? dangerButtonClass : secondaryButtonClass}
                          onClick={() => handleToggleAvailability(variant.id, !variant.active)}
                          pending={availabilityId === variant.id}
                          pendingLabel={variant.active ? 'Revoking' : 'Restoring'}
                          title={
                            variant.active
                              ? 'Revoking resets trainers assigned to this sub-dialect.'
                              : 'Restore this sub-dialect for future selections.'
                          }
                          type="button"
                        >
                          {variant.active ? 'Revoke' : 'Restore'}
                        </ActionButton>
                        <ActionButton
                          className={dangerButtonClass}
                          disabled={variant._count.users > 0 || variant._count.wordRecordings > 0}
                          onClick={() => handleDelete(variant.id)}
                          pending={deletingId === variant.id}
                          pendingLabel="Removing"
                          title={
                            variant._count.users > 0 || variant._count.wordRecordings > 0
                              ? 'This variant still has tagged activity'
                              : undefined
                          }
                          type="button"
                        >
                          Remove
                        </ActionButton>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          <form
            className="grid gap-2 border-t border-line pt-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
            onSubmit={handleCreate}
          >
            <div className="grid gap-1">
              <label className="text-xs font-bold uppercase text-muted" htmlFor="variant-name">
                Name
              </label>
              <input
                className={inputClass}
                id="variant-name"
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Izzi"
                required
                value={name}
              />
            </div>
            <div className="grid gap-1">
              <label className="text-xs font-bold uppercase text-muted" htmlFor="variant-tag">
                Tag
              </label>
              <input
                className={`${inputClass} font-mono`}
                id="variant-tag"
                onChange={(e) => setTag(e.target.value)}
                placeholder="izzi"
                required
                value={tag}
              />
            </div>
            <ActionButton
              className={primaryButtonClass}
              pending={isCreating}
              pendingLabel="Adding"
              type="submit"
            >
              Add variant
            </ActionButton>
          </form>

          {error && (
            <p className="leading-relaxed text-danger" role="alert">
              {error}
            </p>
          )}

          <div className="flex justify-end">
            <DialogClose className={secondaryButtonClass}>Close</DialogClose>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

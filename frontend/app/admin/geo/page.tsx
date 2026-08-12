'use client';

import { useState } from 'react';
import { AdminShell } from '@/components/admin/AdminShell';
import { DataTable, DataTableColumn } from '@/components/ui/DataTable';
import { Dialog, DialogClose, DialogContent, DialogTrigger } from '@/components/ui/Dialog';
import { ActionButton } from '@/components/ui/ActionButton';
import { Keyboard } from 'lucide-react';
import {
  AdminCountry,
  AdminDialect,
  normalizeErrorMessage,
  useCreateCountryMutation,
  useCreateDialectMutation,
  useDeleteCountryMutation,
  useDeleteDialectMutation,
  useGenerateDialectKeyboardLayoutMutation,
  useGetAdminCountriesQuery,
  useGetAdminDialectsQuery,
  useUpdateCountryMutation,
  useUpdateDialectMutation,
} from '@/store/api';

const inputClass = 'min-h-10 w-full rounded-lg border border-line bg-white px-3 py-2.5 text-ink dark:bg-surface-muted';
const primaryButtonClass =
  'inline-flex min-h-10 items-center justify-center rounded-lg border border-accent bg-accent px-3.5 py-2.5 font-bold text-white transition-colors hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60';
const secondaryButtonClass =
  'inline-flex min-h-9 items-center justify-center rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-bold text-ink transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60';
const dangerButtonClass =
  'inline-flex min-h-9 items-center justify-center rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-bold text-danger transition-colors hover:bg-[#fde8e8] disabled:cursor-not-allowed disabled:opacity-60';

export default function AdminGeoPage() {
  const { data: countries, isLoading: isLoadingCountries } = useGetAdminCountriesQuery();
  const { data: dialects, isLoading: isLoadingDialects } = useGetAdminDialectsQuery();

  return (
    <AdminShell>
      <div className="grid gap-6">
        <div className="grid gap-2">
          <h1 className="text-3xl font-black">Countries &amp; Dialects</h1>
          <p className="leading-relaxed text-muted">
            Manage the country and dialect list trainers choose from during onboarding.
          </p>
        </div>

        <CountriesSection countries={countries} isLoading={isLoadingCountries} />
        <DialectsSection dialects={dialects} isLoading={isLoadingDialects} />
      </div>
    </AdminShell>
  );
}

function CountriesSection({ countries, isLoading }: { countries: AdminCountry[] | undefined; isLoading: boolean }) {
  const [deleteCountry] = useDeleteCountryMutation();
  const [updateCountry] = useUpdateCountryMutation();
  const [error, setError] = useState<string | null>(null);
  const [addDialectFor, setAddDialectFor] = useState<AdminCountry | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  async function handleDelete(id: string) {
    setError(null);
    setDeletingId(id);
    try {
      await deleteCountry(id).unwrap();
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to delete country.'));
    } finally {
      setDeletingId(null);
    }
  }

  async function handleToggleGeneration(id: string, llmGenerationEnabled: boolean) {
    setError(null);
    setTogglingId(id);
    try {
      await updateCountry({ id, body: { llmGenerationEnabled } }).unwrap();
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to update word generation coverage.'));
    } finally {
      setTogglingId(null);
    }
  }

  const columns: DataTableColumn<AdminCountry>[] = [
    {
      key: 'name',
      header: 'Country',
      sortValue: (c) => c.name,
      render: (c) => (
        <p className="font-extrabold">
          {c.name} <span className="text-muted">({c.code})</span>
        </p>
      ),
    },
    {
      key: 'dialects',
      header: 'Dialects',
      sortValue: (c) => c._count.dialects,
      render: (c) => c._count.dialects,
    },
    {
      key: 'users',
      header: 'Users',
      sortValue: (c) => c._count.users,
      render: (c) => c._count.users,
    },
    {
      key: 'wordGeneration',
      header: 'Word generation',
      sortValue: (c) => (c.llmGenerationEnabled ? 1 : 0),
      render: (c) => (
        <label className="flex items-center gap-2 text-sm font-bold">
          <input
            checked={c.llmGenerationEnabled}
            className="size-4 accent-accent"
            disabled={togglingId === c.id}
            onChange={(e) => handleToggleGeneration(c.id, e.target.checked)}
            type="checkbox"
          />
          {c.llmGenerationEnabled ? 'Enabled' : 'Disabled'}
        </label>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (c) => (
        <div className="flex flex-wrap gap-2">
          <button className={secondaryButtonClass} onClick={() => setAddDialectFor(c)} type="button">
            + Add dialect
          </button>
          <ActionButton
            className={dangerButtonClass}
            onClick={() => handleDelete(c.id)}
            disabled={c._count.dialects > 0 || c._count.users > 0}
            pending={deletingId === c.id}
            pendingLabel="Deleting"
            title={c._count.dialects > 0 || c._count.users > 0 ? 'Remove dialects and users first' : undefined}
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl leading-snug">Countries</h2>
        <AddCountryDialog />
      </div>

      {error && (
        <p className="leading-relaxed text-danger" role="alert">
          {error}
        </p>
      )}

      <DataTable
        columns={columns}
        rows={countries ?? []}
        rowKey={(c) => c.id}
        isLoading={isLoading}
        emptyMessage="No countries yet."
        searchPlaceholder="Search countries..."
      />

      {addDialectFor && <AddDialectDialog country={addDialectFor} onClose={() => setAddDialectFor(null)} />}
    </section>
  );
}

function AddCountryDialog() {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [createCountry, { isLoading }] = useCreateCountryMutation();

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await createCountry({ code: code.toUpperCase(), name }).unwrap();
      setCode('');
      setName('');
      setOpen(false);
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to create country.'));
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className={primaryButtonClass}>+ Add country</DialogTrigger>
      <DialogContent title="Add country" description="Add a country to the onboarding country list.">
        <form className="grid gap-3" onSubmit={handleCreate}>
          <div className="grid gap-1">
            <label className="text-xs font-bold uppercase text-muted" htmlFor="new-country-code">
              ISO code
            </label>
            <input
              className={inputClass}
              id="new-country-code"
              type="text"
              maxLength={2}
              placeholder="NG"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
            />
          </div>
          <div className="grid gap-1">
            <label className="text-xs font-bold uppercase text-muted" htmlFor="new-country-name">
              Name
            </label>
            <input
              className={inputClass}
              id="new-country-name"
              type="text"
              placeholder="Nigeria"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          {error && (
            <p className="leading-relaxed text-danger" role="alert">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <DialogClose className={secondaryButtonClass}>Cancel</DialogClose>
            <ActionButton className={primaryButtonClass} type="submit" pending={isLoading} pendingLabel="Adding">
              Add country
            </ActionButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AddDialectDialog({ country, onClose }: { country: AdminCountry; onClose: () => void }) {
  const [tag, setTag] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [createDialect, { isLoading }] = useCreateDialectMutation();

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await createDialect({ tag, name, countryId: country.id }).unwrap();
      onClose();
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to create dialect.'));
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent title={`Add dialect to ${country.name}`} description="This dialect will be selectable during onboarding for trainers in this country.">
        <form className="grid gap-3" onSubmit={handleCreate}>
          <div className="grid gap-1">
            <label className="text-xs font-bold uppercase text-muted" htmlFor="new-dialect-tag">
              Tag
            </label>
            <input
              className={inputClass}
              id="new-dialect-tag"
              type="text"
              placeholder="ig"
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              required
            />
          </div>
          <div className="grid gap-1">
            <label className="text-xs font-bold uppercase text-muted" htmlFor="new-dialect-name">
              Name
            </label>
            <input
              className={inputClass}
              id="new-dialect-name"
              type="text"
              placeholder="Igbo"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          {error && (
            <p className="leading-relaxed text-danger" role="alert">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <DialogClose className={secondaryButtonClass}>Cancel</DialogClose>
            <ActionButton className={primaryButtonClass} type="submit" pending={isLoading} pendingLabel="Adding">
              Add dialect
            </ActionButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DialectsSection({ dialects, isLoading }: { dialects: AdminDialect[] | undefined; isLoading: boolean }) {
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
      <h2 className="text-2xl leading-snug">Dialects</h2>

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

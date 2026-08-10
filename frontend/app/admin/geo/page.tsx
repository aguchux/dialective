'use client';

import { useState } from 'react';
import { AdminShell } from '@/components/admin/AdminShell';
import { DataTable, DataTableColumn } from '@/components/ui/DataTable';
import { Dialog, DialogClose, DialogContent, DialogTrigger } from '@/components/ui/Dialog';
import { ActionButton } from '@/components/ui/ActionButton';
import {
  AdminCountry,
  AdminDialect,
  normalizeErrorMessage,
  useCreateCountryMutation,
  useCreateDialectMutation,
  useDeleteCountryMutation,
  useDeleteDialectMutation,
  useGetAdminCountriesQuery,
  useGetAdminDialectsQuery,
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
  const [error, setError] = useState<string | null>(null);
  const [addDialectFor, setAddDialectFor] = useState<AdminCountry | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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

      <DataTable columns={columns} rows={countries ?? []} rowKey={(c) => c.id} isLoading={isLoading} emptyMessage="No countries yet." />

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
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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
      key: 'actions',
      header: 'Actions',
      render: (d) => (
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

      <DataTable columns={columns} rows={dialects ?? []} rowKey={(d) => d.id} isLoading={isLoading} emptyMessage="No dialects yet." />
    </section>
  );
}

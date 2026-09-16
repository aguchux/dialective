'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AdminShell } from '@/components/admin/AdminShell';
import { DataTable, DataTableColumn } from '@/components/ui/DataTable';
import { Dialog, DialogClose, DialogContent, DialogTrigger } from '@/components/ui/Dialog';
import { ActionButton } from '@/components/ui/ActionButton';
import { DialectsTable } from '@/components/admin/geo/DialectsTable';
import { AllVariantsTable } from '@/components/admin/geo/AllVariantsTable';
import {
  AdminCountry,
  AdminDialect,
  normalizeErrorMessage,
  useCreateCountryMutation,
  useCreateDialectMutation,
  useDeleteCountryMutation,
  useGetAdminCountriesQuery,
  useGetAdminDialectsQuery,
  useResetCountryExchangeRateMutation,
  useRefreshExchangeRatesNowMutation,
  useUpdateCountryMutation,
} from '@/store/api';

const inputClass =
  'min-h-10 w-full rounded-lg border border-line bg-white px-3 py-2.5 text-ink dark:bg-surface-muted';
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
        <SubDialectsSection />
      </div>
    </AdminShell>
  );
}

function CountriesSection({
  countries,
  isLoading,
}: {
  countries: AdminCountry[] | undefined;
  isLoading: boolean;
}) {
  const [deleteCountry] = useDeleteCountryMutation();
  const [updateCountry] = useUpdateCountryMutation();
  const [refreshExchangeRatesNow, { isLoading: isRefreshingRates }] =
    useRefreshExchangeRatesNowMutation();
  const [error, setError] = useState<string | null>(null);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);
  const [addDialectFor, setAddDialectFor] = useState<AdminCountry | null>(null);
  const [editingRateFor, setEditingRateFor] = useState<AdminCountry | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  async function handleRefreshExchangeRates() {
    setError(null);
    setRefreshMessage(null);
    try {
      const result = await refreshExchangeRatesNow().unwrap();
      setRefreshMessage(
        `Updated ${result.updated} of ${result.total} live-rate countries` +
          (result.skipped > 0 ? ` (${result.skipped} skipped -- currency not in FX API response)` : ''),
      );
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to refresh exchange rates.'));
    }
  }

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
      key: 'currency',
      header: 'Currency / rate',
      sortValue: (c) => c.currencyCode,
      render: (c) => (
        <div className="grid gap-0.5">
          <p className="font-extrabold">{c.currencyCode}</p>
          <p className="text-xs text-muted">
            {c.usdExchangeRate ? `1 USD ≈ ${c.usdExchangeRate} ${c.currencyCode}` : 'No rate yet'}
            {' · '}
            <span className={c.exchangeRateSource === 'MANUAL' ? 'text-accent' : ''}>
              {c.exchangeRateSource}
            </span>
          </p>
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (c) => (
        <div className="flex flex-wrap gap-2">
          <Link className={secondaryButtonClass} href={`/admin/geo/countries/${c.id}`}>
            View dialects
          </Link>
          <button
            className={secondaryButtonClass}
            onClick={() => setEditingRateFor(c)}
            type="button"
          >
            Edit rate
          </button>
          <button
            className={secondaryButtonClass}
            onClick={() => setAddDialectFor(c)}
            type="button"
          >
            + Add dialect
          </button>
          <ActionButton
            className={dangerButtonClass}
            onClick={() => handleDelete(c.id)}
            disabled={c._count.dialects > 0 || c._count.users > 0}
            pending={deletingId === c.id}
            pendingLabel="Deleting"
            title={
              c._count.dialects > 0 || c._count.users > 0
                ? 'Remove dialects and users first'
                : undefined
            }
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
        <div className="flex flex-wrap gap-2">
          <ActionButton
            className={secondaryButtonClass}
            onClick={handleRefreshExchangeRates}
            pending={isRefreshingRates}
            pendingLabel="Refreshing"
            title="Fetch live rates now instead of waiting for the next scheduled fx-rate-job run"
            type="button"
          >
            Refresh exchange rates now
          </ActionButton>
          <AddCountryDialog />
        </div>
      </div>

      {refreshMessage && <p className="leading-relaxed text-muted">{refreshMessage}</p>}

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

      {addDialectFor && (
        <AddDialectDialog country={addDialectFor} onClose={() => setAddDialectFor(null)} />
      )}
      {editingRateFor && (
        <EditExchangeRateDialog country={editingRateFor} onClose={() => setEditingRateFor(null)} />
      )}
    </section>
  );
}

function EditExchangeRateDialog({
  country,
  onClose,
}: {
  country: AdminCountry;
  onClose: () => void;
}) {
  const [currencyCode, setCurrencyCode] = useState(country.currencyCode);
  const [rate, setRate] = useState(country.usdExchangeRate ?? '');
  const [error, setError] = useState<string | null>(null);
  const [updateCountry, { isLoading: isSaving }] = useUpdateCountryMutation();
  const [resetRate, { isLoading: isResetting }] = useResetCountryExchangeRateMutation();

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const body: { currencyCode: string; usdExchangeRate?: number } = {
        currencyCode: currencyCode.toUpperCase(),
      };
      if (rate !== '') body.usdExchangeRate = Number(rate);
      await updateCountry({ id: country.id, body }).unwrap();
      onClose();
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to update currency/rate.'));
    }
  }

  async function handleResetToLive() {
    setError(null);
    try {
      await resetRate(country.id).unwrap();
      onClose();
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to reset the exchange rate to live.'));
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title={`${country.name} currency & rate`}
        description="Trainers in this country see wallet balances and P2P reference prices in this currency. usdExchangeRate is units of currency per 1 USD."
      >
        <form className="grid gap-3" onSubmit={handleSave}>
          <div className="grid gap-1">
            <label
              className="text-xs font-bold uppercase text-muted"
              htmlFor="country-currency-code"
            >
              Currency code (ISO 4217)
            </label>
            <input
              className={inputClass}
              id="country-currency-code"
              type="text"
              maxLength={3}
              placeholder="NGN"
              value={currencyCode}
              onChange={(e) => setCurrencyCode(e.target.value)}
              required
            />
          </div>
          <div className="grid gap-1">
            <label
              className="text-xs font-bold uppercase text-muted"
              htmlFor="country-exchange-rate"
            >
              Manual USD exchange rate (optional)
            </label>
            <input
              className={inputClass}
              id="country-exchange-rate"
              type="number"
              min="0"
              step="any"
              placeholder="Leave blank to keep the current rate"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
            />
            <p className="text-xs text-muted">
              Current:{' '}
              {country.usdExchangeRate
                ? `1 USD ≈ ${country.usdExchangeRate} ${country.currencyCode}`
                : 'not set yet'}{' '}
              · {country.exchangeRateSource}
              {country.exchangeRateUpdatedAt &&
                ` · as of ${new Date(country.exchangeRateUpdatedAt).toLocaleString()}`}
            </p>
            <p className="text-xs text-muted">
              Setting a rate here marks it MANUAL -- the live fx-rate-job will skip this country
              until reset.
            </p>
          </div>
          {error && (
            <p className="leading-relaxed text-danger" role="alert">
              {error}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <ActionButton
              className={secondaryButtonClass}
              disabled={country.exchangeRateSource !== 'MANUAL'}
              onClick={handleResetToLive}
              pending={isResetting}
              pendingLabel="Resetting"
              type="button"
            >
              Reset to live
            </ActionButton>
            <div className="flex gap-2">
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
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AddCountryDialog() {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [currencyCode, setCurrencyCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [createCountry, { isLoading }] = useCreateCountryMutation();

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await createCountry({
        code: code.toUpperCase(),
        name,
        currencyCode: currencyCode ? currencyCode.toUpperCase() : undefined,
      }).unwrap();
      setCode('');
      setName('');
      setCurrencyCode('');
      setOpen(false);
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to create country.'));
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className={primaryButtonClass}>+ Add country</DialogTrigger>
      <DialogContent
        title="Add country"
        description="Add a country to the onboarding country list."
      >
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
          <div className="grid gap-1">
            <label
              className="text-xs font-bold uppercase text-muted"
              htmlFor="new-country-currency"
            >
              Currency code (ISO 4217, optional)
            </label>
            <input
              className={inputClass}
              id="new-country-currency"
              type="text"
              maxLength={3}
              placeholder="NGN (defaults to USD)"
              value={currencyCode}
              onChange={(e) => setCurrencyCode(e.target.value)}
            />
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
              pending={isLoading}
              pendingLabel="Adding"
            >
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
      <DialogContent
        title={`Add dialect to ${country.name}`}
        description="This dialect will be selectable during onboarding for trainers in this country."
      >
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
            <ActionButton
              className={primaryButtonClass}
              type="submit"
              pending={isLoading}
              pendingLabel="Adding"
            >
              Add dialect
            </ActionButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DialectsSection({
  dialects,
  isLoading,
}: {
  dialects: AdminDialect[] | undefined;
  isLoading: boolean;
}) {
  return (
    <section className="grid gap-4">
      <h2 className="text-2xl leading-snug">Dialects</h2>
      <DialectsTable dialects={dialects} isLoading={isLoading} />
    </section>
  );
}

function SubDialectsSection() {
  return (
    <section className="grid gap-4">
      <div className="grid gap-1">
        <h2 className="text-2xl leading-snug">Sub-dialects</h2>
        <p className="leading-relaxed text-muted">
          Every sub-dialect across every country, searchable by name -- pause or resume word
          tasks for a specific sub-dialect directly, without opening its parent dialect first.
        </p>
      </div>
      <AllVariantsTable />
    </section>
  );
}

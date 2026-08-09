'use client';

import { useState } from 'react';
import { AdminShell } from '@/components/admin/AdminShell';
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
const selectClass = 'min-h-10 w-full rounded-lg border border-line bg-white px-3 py-2.5 text-ink dark:bg-surface-muted';
const primaryButtonClass =
  'inline-flex min-h-10 items-center justify-center rounded-lg border border-accent bg-accent px-3.5 py-2.5 font-bold text-white transition-colors hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60';
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
        <DialectsSection dialects={dialects} countries={countries} isLoading={isLoadingDialects} />
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
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [createCountry, { isLoading: isCreating }] = useCreateCountryMutation();
  const [deleteCountry] = useDeleteCountryMutation();

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await createCountry({ code: code.toUpperCase(), name }).unwrap();
      setCode('');
      setName('');
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to create country.'));
    }
  }

  async function handleDelete(id: string) {
    setError(null);
    try {
      await deleteCountry(id).unwrap();
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to delete country.'));
    }
  }

  return (
    <section className="grid gap-4 rounded-lg border border-line bg-white p-5 shadow-[0_2px_8px_rgba(27,31,27,0.05)]">
      <h2 className="text-2xl leading-snug">Countries</h2>

      <form className="grid gap-2.5 sm:grid-cols-[100px_minmax(0,1fr)_auto] sm:items-end" onSubmit={handleCreate}>
        <div className="grid gap-1">
          <label className="text-xs font-bold uppercase text-muted" htmlFor="country-code">
            ISO code
          </label>
          <input
            className={inputClass}
            id="country-code"
            type="text"
            maxLength={2}
            placeholder="NG"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
          />
        </div>
        <div className="grid gap-1">
          <label className="text-xs font-bold uppercase text-muted" htmlFor="country-name">
            Name
          </label>
          <input
            className={inputClass}
            id="country-name"
            type="text"
            placeholder="Nigeria"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <button className={primaryButtonClass} type="submit" disabled={isCreating}>
          Add country
        </button>
      </form>

      {error && (
        <p className="leading-relaxed text-danger" role="alert">
          {error}
        </p>
      )}

      {isLoading && <p className="text-muted">Loading...</p>}
      {countries && countries.length === 0 && <p className="text-muted">No countries yet.</p>}
      {countries && countries.length > 0 && (
        <div className="grid gap-2">
          {countries.map((country) => (
            <div
              className="grid gap-2 rounded-lg border border-line bg-surface p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
              key={country.id}
            >
              <div>
                <p className="font-extrabold">
                  {country.name} <span className="text-muted">({country.code})</span>
                </p>
                <p className="text-sm text-muted">
                  {country._count.dialects} dialect{country._count.dialects === 1 ? '' : 's'} &middot; {country._count.users} user
                  {country._count.users === 1 ? '' : 's'}
                </p>
              </div>
              <button
                className={dangerButtonClass}
                onClick={() => handleDelete(country.id)}
                disabled={country._count.dialects > 0 || country._count.users > 0}
                title={
                  country._count.dialects > 0 || country._count.users > 0
                    ? 'Remove dialects and users first'
                    : undefined
                }
                type="button"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function DialectsSection({
  dialects,
  countries,
  isLoading,
}: {
  dialects: AdminDialect[] | undefined;
  countries: AdminCountry[] | undefined;
  isLoading: boolean;
}) {
  const [tag, setTag] = useState('');
  const [name, setName] = useState('');
  const [countryId, setCountryId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [createDialect, { isLoading: isCreating }] = useCreateDialectMutation();
  const [deleteDialect] = useDeleteDialectMutation();

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!countryId) {
      setError('Choose a country.');
      return;
    }
    try {
      await createDialect({ tag, name, countryId }).unwrap();
      setTag('');
      setName('');
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to create dialect.'));
    }
  }

  async function handleDelete(id: string) {
    setError(null);
    try {
      await deleteDialect(id).unwrap();
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to delete dialect.'));
    }
  }

  return (
    <section className="grid gap-4 rounded-lg border border-line bg-white p-5 shadow-[0_2px_8px_rgba(27,31,27,0.05)]">
      <h2 className="text-2xl leading-snug">Dialects</h2>

      <form
        className="grid gap-2.5 sm:grid-cols-[140px_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end"
        onSubmit={handleCreate}
      >
        <div className="grid gap-1">
          <label className="text-xs font-bold uppercase text-muted" htmlFor="dialect-tag">
            Tag
          </label>
          <input
            className={inputClass}
            id="dialect-tag"
            type="text"
            placeholder="ig"
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            required
          />
        </div>
        <div className="grid gap-1">
          <label className="text-xs font-bold uppercase text-muted" htmlFor="dialect-name">
            Name
          </label>
          <input
            className={inputClass}
            id="dialect-name"
            type="text"
            placeholder="Igbo"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div className="grid gap-1">
          <label className="text-xs font-bold uppercase text-muted" htmlFor="dialect-country">
            Country
          </label>
          <select className={selectClass} id="dialect-country" value={countryId} onChange={(e) => setCountryId(e.target.value)} required>
            <option value="">Choose...</option>
            {countries?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <button className={primaryButtonClass} type="submit" disabled={isCreating}>
          Add dialect
        </button>
      </form>

      {error && (
        <p className="leading-relaxed text-danger" role="alert">
          {error}
        </p>
      )}

      {isLoading && <p className="text-muted">Loading...</p>}
      {dialects && dialects.length === 0 && <p className="text-muted">No dialects yet.</p>}
      {dialects && dialects.length > 0 && (
        <div className="grid gap-2">
          {dialects.map((dialect) => (
            <div
              className="grid gap-2 rounded-lg border border-line bg-surface p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
              key={dialect.id}
            >
              <div>
                <p className="font-extrabold">
                  {dialect.name} <span className="text-muted">({dialect.tag})</span>
                </p>
                <p className="text-sm text-muted">
                  {dialect.country.name} &middot; {dialect._count.users} user{dialect._count.users === 1 ? '' : 's'}
                </p>
              </div>
              <button
                className={dangerButtonClass}
                onClick={() => handleDelete(dialect.id)}
                disabled={dialect._count.users > 0}
                title={dialect._count.users > 0 ? 'Reassign users first' : undefined}
                type="button"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

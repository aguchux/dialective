'use client';

import { useEffect, useState } from 'react';
import {
  leadsApi,
  type Country,
  type DataAccessLeadInterestInput,
  type Dialect,
  type DialectVariant,
} from '@/lib/leads-api';

/**
 * Hierarchical multi-select: check a country -> its dialects appear ->
 * check a dialect -> its subdialects appear -> check them. Mirrors
 * frontend/components/CountryDialectPicker.tsx, adapted to plain fetches
 * (leads-api.ts) instead of RTK Query hooks since this form's endpoints
 * sit outside store/api.ts's /voice-stream-prefixed baseQuery.
 */
export function CountryDialectPicker({
  value,
  onChange,
}: {
  value: DataAccessLeadInterestInput[];
  onChange: (next: DataAccessLeadInterestInput[]) => void;
}) {
  const [countries, setCountries] = useState<Country[] | null>(null);
  const [expandedCountryId, setExpandedCountryId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    leadsApi
      .getCountries()
      .then(setCountries)
      .catch(() => setCountries([]));
  }, []);

  const checkedCountryIds = new Set(value.map((v) => v.countryId));
  const filteredCountries = (countries ?? []).filter((country) =>
    country.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  function toggleCountry(countryId: string, checked: boolean) {
    if (checked) {
      onChange([...value, { countryId, dialectTags: [], subdialectTags: [] }]);
      setExpandedCountryId(countryId);
    } else {
      onChange(value.filter((v) => v.countryId !== countryId));
      if (expandedCountryId === countryId) setExpandedCountryId(null);
    }
  }

  function updateInterest(countryId: string, patch: Partial<DataAccessLeadInterestInput>) {
    onChange(value.map((v) => (v.countryId === countryId ? { ...v, ...patch } : v)));
  }

  if (countries === null) {
    return <p className="text-sm text-muted">Loading countries…</p>;
  }

  return (
    <div className="grid gap-2">
      <p className="text-xs font-bold uppercase tracking-wide text-muted">
        Countries and dialects of interest
      </p>
      <input
        className="min-h-9 w-full rounded-lg border border-line bg-white px-3 py-1.5 text-sm text-ink outline-none transition-colors focus:border-accent"
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search countries…"
        type="text"
        value={search}
      />
      <div className="grid max-h-44 gap-1 overflow-y-auto rounded-lg border border-line bg-white p-2">
        {filteredCountries.map((country) => {
          const checked = checkedCountryIds.has(country.id);
          const interest = value.find((v) => v.countryId === country.id);
          return (
            <div className="grid gap-1" key={country.id}>
              <label className="flex min-h-8 cursor-pointer items-center gap-2 rounded px-1.5 py-1 hover:bg-surface-muted">
                <input
                  checked={checked}
                  onChange={(e) => toggleCountry(country.id, e.target.checked)}
                  type="checkbox"
                />
                <span className="font-semibold text-ink">{country.name}</span>
              </label>

              {checked && interest && expandedCountryId === country.id ? (
                <DialectList
                  countryId={country.id}
                  interest={interest}
                  onChange={(patch) => updateInterest(country.id, patch)}
                />
              ) : checked ? (
                <button
                  className="ml-6 w-fit text-left text-xs font-semibold text-accent underline"
                  onClick={() => setExpandedCountryId(country.id)}
                  type="button"
                >
                  Edit dialects ({interest?.dialectTags.length ?? 0} selected)
                </button>
              ) : null}
            </div>
          );
        })}
        {countries.length === 0 && (
          <p className="px-1.5 py-2 text-sm text-muted">No countries available yet.</p>
        )}
        {countries.length > 0 && filteredCountries.length === 0 && (
          <p className="px-1.5 py-2 text-sm text-muted">No countries match &quot;{search}&quot;.</p>
        )}
      </div>
    </div>
  );
}

function DialectList({
  countryId,
  interest,
  onChange,
}: {
  countryId: string;
  interest: DataAccessLeadInterestInput;
  onChange: (patch: Partial<DataAccessLeadInterestInput>) => void;
}) {
  const [dialects, setDialects] = useState<Dialect[] | null>(null);
  const [expandedDialectId, setExpandedDialectId] = useState<string | null>(null);

  useEffect(() => {
    setDialects(null);
    leadsApi
      .getDialects(countryId)
      .then(setDialects)
      .catch(() => setDialects([]));
  }, [countryId]);

  function toggleDialect(tag: string, checked: boolean) {
    onChange({
      dialectTags: checked
        ? [...interest.dialectTags, tag]
        : interest.dialectTags.filter((t) => t !== tag),
    });
  }

  if (dialects === null) {
    return <p className="ml-6 text-xs text-muted">Loading dialects…</p>;
  }

  return (
    <div className="ml-6 grid gap-1 border-l border-line pl-3">
      {dialects.map((dialect) => {
        const checked = interest.dialectTags.includes(dialect.tag);
        return (
          <div className="grid gap-1" key={dialect.id}>
            <label className="flex min-h-7 cursor-pointer items-center gap-2 rounded px-1 py-0.5 hover:bg-surface-muted">
              <input
                checked={checked}
                onChange={(e) => toggleDialect(dialect.tag, e.target.checked)}
                type="checkbox"
              />
              <span className="text-sm text-ink">{dialect.name}</span>
            </label>
            {checked && (
              <SubdialectList
                dialectId={dialect.id}
                expanded={expandedDialectId === dialect.id}
                interest={interest}
                onChange={onChange}
                onToggleExpand={() =>
                  setExpandedDialectId(expandedDialectId === dialect.id ? null : dialect.id)
                }
              />
            )}
          </div>
        );
      })}
      {dialects.length === 0 && (
        <p className="py-1 text-xs text-muted">No dialects listed for this country yet.</p>
      )}
    </div>
  );
}

function SubdialectList({
  dialectId,
  interest,
  expanded,
  onToggleExpand,
  onChange,
}: {
  dialectId: string;
  interest: DataAccessLeadInterestInput;
  expanded: boolean;
  onToggleExpand: () => void;
  onChange: (patch: Partial<DataAccessLeadInterestInput>) => void;
}) {
  const [variants, setVariants] = useState<DialectVariant[]>([]);

  useEffect(() => {
    leadsApi
      .getDialectVariants(dialectId)
      .then(setVariants)
      .catch(() => setVariants([]));
  }, [dialectId]);

  if (variants.length === 0) return null;

  if (!expanded) {
    return (
      <button
        className="ml-6 w-fit text-left text-xs font-semibold text-accent underline"
        onClick={onToggleExpand}
        type="button"
      >
        Subdialects ({variants.filter((v) => interest.subdialectTags.includes(v.tag)).length}/
        {variants.length} selected)
      </button>
    );
  }

  function toggleSubdialect(tag: string, checked: boolean) {
    onChange({
      subdialectTags: checked
        ? [...interest.subdialectTags, tag]
        : interest.subdialectTags.filter((t) => t !== tag),
    });
  }

  return (
    <div className="ml-6 grid gap-0.5 border-l border-line pl-3">
      {variants.map((variant) => (
        <label
          className="flex min-h-6 cursor-pointer items-center gap-2 rounded px-1 py-0.5 hover:bg-surface-muted"
          key={variant.id}
        >
          <input
            checked={interest.subdialectTags.includes(variant.tag)}
            onChange={(e) => toggleSubdialect(variant.tag, e.target.checked)}
            type="checkbox"
          />
          <span className="text-xs text-ink">{variant.name}</span>
        </label>
      ))}
    </div>
  );
}

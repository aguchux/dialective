'use client';

import { useState } from 'react';
import {
  normalizeErrorMessage,
  useCreateAudioRetentionRuleMutation,
  useDeleteAudioRetentionRuleMutation,
  useGetAdminCountriesQuery,
  useGetAdminDialectsQuery,
  useGetAudioRetentionRulesQuery,
  useUpdateAudioRetentionRuleMutation,
} from '@/store/api';
import { ActionButton } from '@/components/ui/ActionButton';

const inputClass = 'min-h-10 w-full rounded-lg border border-line bg-white px-3 py-2.5 text-ink dark:bg-surface-muted';
const primaryButtonClass =
  'inline-flex min-h-10 items-center justify-center rounded-lg border border-accent bg-accent px-3.5 py-2.5 font-bold text-white transition-colors hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60';

function scopeLabel(country: { name: string } | null, dialectTag: string | null, dialects?: { tag: string; name: string }[]) {
  const countryPart = country ? country.name : 'All countries';
  const dialectPart = dialectTag ? (dialects?.find((d) => d.tag === dialectTag)?.name ?? dialectTag) : 'all dialects';
  return `${countryPart} / ${dialectPart}`;
}

export function DatasetStorageSettingsPanel() {
  const { data: rules, isLoading } = useGetAudioRetentionRulesQuery();
  const { data: countries } = useGetAdminCountriesQuery();
  const { data: dialects } = useGetAdminDialectsQuery();
  const [createRule, { isLoading: isCreating }] = useCreateAudioRetentionRuleMutation();
  const [updateRule] = useUpdateAudioRetentionRuleMutation();
  const [deleteRule] = useDeleteAudioRetentionRuleMutation();

  const [newCountryId, setNewCountryId] = useState('');
  const [newDialectTag, setNewDialectTag] = useState('');
  const [newRetentionDays, setNewRetentionDays] = useState('90');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dialectOptions = newCountryId ? (dialects ?? []).filter((d) => d.countryId === newCountryId) : (dialects ?? []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setError(null);
    const days = Number(newRetentionDays);
    if (!Number.isInteger(days) || days < 1) {
      setError('Retention days must be a whole number of at least 1.');
      return;
    }
    try {
      await createRule({
        countryId: newCountryId || null,
        dialectTag: newDialectTag || null,
        retentionDays: days,
      }).unwrap();
      setNewCountryId('');
      setNewDialectTag('');
      setNewRetentionDays('90');
      setMessage('Retention rule added.');
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to add this retention rule.'));
    }
  }

  async function handleToggle(id: string, enabled: boolean) {
    setError(null);
    try {
      await updateRule({ id, body: { enabled } }).unwrap();
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to update this rule.'));
    }
  }

  async function handleRetentionDaysChange(id: string, value: string) {
    const days = Number(value);
    if (!Number.isInteger(days) || days < 1) return;
    setError(null);
    try {
      await updateRule({ id, body: { retentionDays: days } }).unwrap();
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to update this rule.'));
    }
  }

  async function handleDelete(id: string) {
    setError(null);
    try {
      await deleteRule(id).unwrap();
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to delete this rule.'));
    }
  }

  return (
    <section className="grid gap-4 rounded-lg border border-line bg-white p-5 shadow-[0_2px_8px_rgba(27,31,27,0.05)]">
      <div className="grid gap-1">
        <h2 className="text-2xl leading-snug">Dataset &amp; Storage</h2>
        <p className="leading-relaxed text-muted">
          Controls automatic deletion of stored recording audio in DigitalOcean Spaces, once a submission or word
          recording is fully settled or refunded. <strong>This deletes only the audio file.</strong> Transcripts,
          per-word ASR detail, consensus scores, and all other dataset fields are never deleted by this feature --
          they remain in Postgres permanently.
        </p>
      </div>

      {isLoading && <p className="text-muted">Loading...</p>}

      {!isLoading && (
        <>
          <div className="grid gap-2">
            <p className="text-sm font-bold text-muted">
              {rules && rules.length > 0
                ? 'Rules are evaluated most-specific first: country + dialect beats dialect-only beats country-only beats an unscoped rule. A row with no matching enabled rule keeps its audio forever.'
                : 'No rules configured -- audio deletion is off. Add a rule below to enable it, scoped to all data or to a specific country/dialect.'}
            </p>

            {rules && rules.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-muted">
                      <th className="py-2 pr-3 font-bold">Scope</th>
                      <th className="py-2 pr-3 font-bold">Retention (days)</th>
                      <th className="py-2 pr-3 font-bold">Enabled</th>
                      <th className="py-2 pr-3 font-bold" />
                    </tr>
                  </thead>
                  <tbody>
                    {rules.map((rule) => (
                      <tr key={rule.id} className="border-b border-line/60">
                        <td className="py-2 pr-3">{scopeLabel(rule.country, rule.dialectTag, dialects)}</td>
                        <td className="py-2 pr-3">
                          <input
                            className={`${inputClass} max-w-[7rem]`}
                            defaultValue={rule.retentionDays}
                            min="1"
                            onBlur={(e) => handleRetentionDaysChange(rule.id, e.target.value)}
                            step="1"
                            type="number"
                          />
                        </td>
                        <td className="py-2 pr-3">
                          <input
                            checked={rule.enabled}
                            className="size-5 accent-accent"
                            onChange={(e) => handleToggle(rule.id, e.target.checked)}
                            type="checkbox"
                          />
                        </td>
                        <td className="py-2 pr-3">
                          <button
                            className="font-bold text-danger hover:underline"
                            onClick={() => handleDelete(rule.id)}
                            type="button"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <form className="grid gap-3 rounded-lg border border-line bg-surface-muted p-4 md:max-w-lg" onSubmit={handleAdd}>
            <p className="font-bold">Add a rule</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm font-bold" htmlFor="rule-country">
                Country
                <select
                  className={inputClass}
                  id="rule-country"
                  onChange={(e) => {
                    setNewCountryId(e.target.value);
                    setNewDialectTag('');
                  }}
                  value={newCountryId}
                >
                  <option value="">All countries</option>
                  {(countries ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm font-bold" htmlFor="rule-dialect">
                Dialect
                <select
                  className={inputClass}
                  id="rule-dialect"
                  onChange={(e) => setNewDialectTag(e.target.value)}
                  value={newDialectTag}
                >
                  <option value="">All dialects</option>
                  {dialectOptions.map((d) => (
                    <option key={d.id} value={d.tag}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="grid gap-1 text-sm font-bold" htmlFor="rule-retention-days">
              Retention (days)
              <input
                className={inputClass}
                id="rule-retention-days"
                min="1"
                onChange={(e) => setNewRetentionDays(e.target.value)}
                step="1"
                type="number"
                value={newRetentionDays}
              />
            </label>
            <div>
              <ActionButton className={primaryButtonClass} pending={isCreating} pendingLabel="Adding" type="submit">
                Add rule
              </ActionButton>
            </div>
          </form>
        </>
      )}

      {message && <p className="leading-relaxed text-accent-dark">{message}</p>}
      {error && (
        <p className="leading-relaxed text-danger" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

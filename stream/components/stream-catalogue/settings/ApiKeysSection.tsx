'use client';

import { FormEvent, useState } from 'react';
import { KeyRound, Plus, RotateCw, Trash2 } from 'lucide-react';
import {
  CreatedStreamApiKey,
  StreamApiKeySummary,
  StreamKeyScope,
  useCreateStreamKeyMutation,
  useListStreamDecksQuery,
  useListStreamKeysQuery,
  useRevokeStreamKeyMutation,
  useRotateStreamKeyMutation,
} from '@/store/api';
import { Skeleton } from '../primitives';
import {
  SettingsCard,
  SettingsErrorText,
  SettingsField,
  SettingsPrimaryButton,
  SettingsSecondaryButton,
  settingsInputClassName,
} from './SettingsCard';

const ALL_SCOPES: { value: StreamKeyScope; label: string }[] = [
  { value: 'DECK_LIST', label: 'List decks' },
  { value: 'DECK_READ', label: 'Read deck details & items' },
  { value: 'METADATA_READ', label: 'Read recording metadata' },
  { value: 'MANIFEST_READ', label: 'Read training manifest' },
  { value: 'AUDIO_STREAM', label: 'Stream audio' },
  { value: 'USAGE_READ', label: 'Read usage' },
];

function keyStatus(key: StreamApiKeySummary): { label: string; className: string } {
  if (key.revokedAt) return { label: 'Revoked', className: 'bg-danger/15 text-danger' };
  if (key.expiresAt && new Date(key.expiresAt).getTime() <= Date.now()) {
    return { label: 'Expired', className: 'bg-danger/15 text-danger' };
  }
  return { label: 'Active', className: 'bg-catalogue-green/15 text-catalogue-green' };
}

function RevealedKeyBanner({ created, onDismiss }: { created: CreatedStreamApiKey; onDismiss: () => void }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(created.plaintextKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="rounded-lg border border-catalogue-blue/40 bg-catalogue-blue/10 p-4">
      <p className="mb-2 text-sm font-bold text-catalogue-blue-bright">
        Copy this key now -- it will not be shown again.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 break-all rounded-lg border border-catalogue-line bg-catalogue-bg px-3 py-2 text-sm text-catalogue-ink">
          {created.plaintextKey}
        </code>
        <SettingsPrimaryButton onClick={() => void copy()}>{copied ? 'Copied' : 'Copy'}</SettingsPrimaryButton>
        <SettingsSecondaryButton onClick={onDismiss}>Done</SettingsSecondaryButton>
      </div>
    </div>
  );
}

function CreateKeyForm({ onCreated, onDone }: { onCreated: (key: CreatedStreamApiKey) => void; onDone: () => void }) {
  const { data: decks } = useListStreamDecksQuery();
  const [createKey, { isLoading }] = useCreateStreamKeyMutation();
  const [deckId, setDeckId] = useState('');
  const [scopes, setScopes] = useState<StreamKeyScope[]>([]);
  const [allowedIps, setAllowedIps] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [error, setError] = useState<string | null>(null);

  function toggleScope(scope: StreamKeyScope) {
    setScopes((current) => (current.includes(scope) ? current.filter((s) => s !== scope) : [...current, scope]));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (scopes.length === 0) {
      setError('Select at least one scope.');
      return;
    }
    try {
      const result = await createKey({
        deckId: deckId || undefined,
        scopes,
        allowedIps: allowedIps ? allowedIps.split(',').map((ip) => ip.trim()).filter(Boolean) : undefined,
        expiresAt: expiresAt || undefined,
      }).unwrap();
      onCreated(result);
    } catch (err: any) {
      setError(err?.data?.message ?? 'Unable to create this Stream Key.');
    }
  }

  return (
    <form className="grid gap-3 rounded-lg border border-catalogue-line bg-catalogue-bg p-4" onSubmit={submit}>
      <SettingsField label="Scope of access">
        <select
          className={settingsInputClassName}
          onChange={(e) => setDeckId(e.target.value)}
          value={deckId}
        >
          <option value="">All authorized Stream Decks (org-wide)</option>
          {decks?.map((deck) => (
            <option key={deck.id} value={deck.id}>
              {deck.name} ({deck.deckKey})
            </option>
          ))}
        </select>
      </SettingsField>
      <SettingsField label="Scopes">
        <div className="grid gap-1.5 sm:grid-cols-2">
          {ALL_SCOPES.map((scope) => (
            <label className="flex items-center gap-2 text-sm text-catalogue-ink" key={scope.value}>
              <input checked={scopes.includes(scope.value)} onChange={() => toggleScope(scope.value)} type="checkbox" />
              {scope.label}
            </label>
          ))}
        </div>
      </SettingsField>
      <SettingsField label="IP allowlist (optional, comma-separated)">
        <input
          className={settingsInputClassName}
          onChange={(e) => setAllowedIps(e.target.value)}
          placeholder="203.0.113.5, 198.51.100.0"
          value={allowedIps}
        />
      </SettingsField>
      <SettingsField label="Expires (optional)">
        <input className={settingsInputClassName} onChange={(e) => setExpiresAt(e.target.value)} type="date" value={expiresAt} />
      </SettingsField>
      {error && <SettingsErrorText>{error}</SettingsErrorText>}
      <div className="flex gap-2">
        <SettingsPrimaryButton disabled={isLoading} type="submit">
          {isLoading ? 'Creating...' : 'Create key'}
        </SettingsPrimaryButton>
        <SettingsSecondaryButton onClick={onDone}>Cancel</SettingsSecondaryButton>
      </div>
    </form>
  );
}

function KeyRow({ streamKey }: { streamKey: StreamApiKeySummary }) {
  const [rotate, { isLoading: isRotating }] = useRotateStreamKeyMutation();
  const [revoke, { isLoading: isRevoking }] = useRevokeStreamKeyMutation();
  const [rotated, setRotated] = useState<CreatedStreamApiKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const status = keyStatus(streamKey);

  async function handleRotate() {
    setError(null);
    try {
      setRotated(await rotate(streamKey.id).unwrap());
    } catch (err: any) {
      setError(err?.data?.message ?? 'Unable to rotate this key.');
    }
  }

  async function handleRevoke() {
    setError(null);
    try {
      await revoke(streamKey.id).unwrap();
    } catch (err: any) {
      setError(err?.data?.message ?? 'Unable to revoke this key.');
    }
  }

  return (
    <div className="rounded-lg border border-catalogue-line bg-catalogue-bg p-3.5">
      {rotated && (
        <div className="mb-3">
          <RevealedKeyBanner created={rotated} onDismiss={() => setRotated(null)} />
        </div>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <KeyRound aria-hidden="true" className="size-4 text-catalogue-dim" />
            <code className="text-sm font-bold text-catalogue-ink">{streamKey.keyPrefix}...</code>
          </div>
          <p className="mt-1 text-xs text-catalogue-muted">
            {streamKey.deckId ? 'Deck-scoped' : 'Org-wide'} -- {streamKey.scopes.join(', ')}
          </p>
          <p className="mt-1 text-xs text-catalogue-dim">
            Last used: {streamKey.lastUsedAt ? new Date(streamKey.lastUsedAt).toLocaleString() : 'never'}
            {streamKey.expiresAt && ` -- Expires: ${new Date(streamKey.expiresAt).toLocaleDateString()}`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${status.className}`}>{status.label}</span>
          {!streamKey.revokedAt && (
            <>
              <SettingsSecondaryButton disabled={isRotating} onClick={() => void handleRotate()}>
                <RotateCw aria-hidden="true" className="size-3.5" />
              </SettingsSecondaryButton>
              <SettingsSecondaryButton disabled={isRevoking} onClick={() => void handleRevoke()}>
                <Trash2 aria-hidden="true" className="size-3.5" />
              </SettingsSecondaryButton>
            </>
          )}
        </div>
      </div>
      {error && (
        <div className="mt-2">
          <SettingsErrorText>{error}</SettingsErrorText>
        </div>
      )}
    </div>
  );
}

export function ApiKeysSection() {
  const { data: keys, isLoading } = useListStreamKeysQuery();
  const [showForm, setShowForm] = useState(false);
  const [created, setCreated] = useState<CreatedStreamApiKey | null>(null);

  return (
    <SettingsCard
      description="Credentials external and programmatic clients use to pull data from Voice Stream."
      title="API Keys"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-catalogue-dim">Not for browser/dashboard sign-in.</p>
        {!showForm && (
          <SettingsPrimaryButton onClick={() => setShowForm(true)}>
            <Plus aria-hidden="true" className="size-4" />
            New key
          </SettingsPrimaryButton>
        )}
      </div>

      {created && <RevealedKeyBanner created={created} onDismiss={() => setCreated(null)} />}

      {showForm && (
        <CreateKeyForm
          onCreated={(key) => {
            setCreated(key);
            setShowForm(false);
          }}
          onDone={() => setShowForm(false)}
        />
      )}

      {isLoading ? (
        <Skeleton className="h-16 w-full" />
      ) : keys && keys.length > 0 ? (
        <div className="grid gap-2.5">
          {keys.map((key) => (
            <KeyRow key={key.id} streamKey={key} />
          ))}
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-catalogue-line-strong p-4 text-center text-sm text-catalogue-muted">
          No API keys yet.
        </p>
      )}
    </SettingsCard>
  );
}

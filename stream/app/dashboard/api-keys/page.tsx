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
import {
  Card,
  ErrorText,
  FieldLabel,
  PageHeading,
  PrimaryButton,
  SecondaryButton,
  TextInput,
} from '@/components/ui';

const ALL_SCOPES: { value: StreamKeyScope; label: string }[] = [
  { value: 'DECK_LIST', label: 'List decks' },
  { value: 'DECK_READ', label: 'Read deck details & items' },
  { value: 'METADATA_READ', label: 'Read recording metadata' },
  { value: 'MANIFEST_READ', label: 'Read training manifest' },
  { value: 'AUDIO_STREAM', label: 'Stream audio' },
  { value: 'USAGE_READ', label: 'Read usage' },
];

function keyStatus(key: StreamApiKeySummary): { label: string; className: string } {
  if (key.revokedAt) return { label: 'Revoked', className: 'bg-danger/10 text-danger' };
  if (key.expiresAt && new Date(key.expiresAt).getTime() <= Date.now()) {
    return { label: 'Expired', className: 'bg-danger/10 text-danger' };
  }
  return { label: 'Active', className: 'bg-accent/10 text-accent-dark' };
}

function RevealedKeyBanner({ created, onDismiss }: { created: CreatedStreamApiKey; onDismiss: () => void }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(created.plaintextKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Card className="mb-6 border-accent bg-accent-soft p-5">
      <p className="mb-2 text-sm font-bold text-accent-dark">
        Copy this key now -- it will not be shown again.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 break-all rounded-lg border border-line bg-white px-3 py-2.5 text-sm">
          {created.plaintextKey}
        </code>
        <PrimaryButton onClick={copy} type="button">
          {copied ? 'Copied' : 'Copy'}
        </PrimaryButton>
        <SecondaryButton onClick={onDismiss} type="button">
          Done
        </SecondaryButton>
      </div>
    </Card>
  );
}

function CreateKeyForm({
  onCreated,
  onDone,
}: {
  onCreated: (key: CreatedStreamApiKey) => void;
  onDone: () => void;
}) {
  const { data: decks } = useListStreamDecksQuery();
  const [createKey, { isLoading }] = useCreateStreamKeyMutation();
  const [deckId, setDeckId] = useState('');
  const [scopes, setScopes] = useState<StreamKeyScope[]>([]);
  const [allowedIps, setAllowedIps] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [error, setError] = useState<string | null>(null);

  function toggleScope(scope: StreamKeyScope) {
    setScopes((current) =>
      current.includes(scope) ? current.filter((s) => s !== scope) : [...current, scope],
    );
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
        allowedIps: allowedIps
          ? allowedIps.split(',').map((ip) => ip.trim()).filter(Boolean)
          : undefined,
        expiresAt: expiresAt || undefined,
      }).unwrap();
      onCreated(result);
    } catch (err: any) {
      setError(err?.data?.message ?? 'Unable to create this Stream Key.');
    }
  }

  return (
    <Card className="mb-6 p-5">
      <form className="grid gap-4" onSubmit={submit}>
        <div>
          <FieldLabel>Scope of access</FieldLabel>
          <select
            className="min-h-10 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink outline-none focus:border-accent"
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
        </div>

        <div>
          <FieldLabel>Scopes</FieldLabel>
          <div className="grid gap-2 sm:grid-cols-2">
            {ALL_SCOPES.map((scope) => (
              <label className="flex items-center gap-2 text-sm text-ink" key={scope.value}>
                <input
                  checked={scopes.includes(scope.value)}
                  onChange={() => toggleScope(scope.value)}
                  type="checkbox"
                />
                {scope.label}
              </label>
            ))}
          </div>
        </div>

        <div>
          <FieldLabel>IP allowlist (optional, comma-separated)</FieldLabel>
          <TextInput
            onChange={(e) => setAllowedIps(e.target.value)}
            placeholder="203.0.113.5, 198.51.100.0"
            value={allowedIps}
          />
        </div>

        <div>
          <FieldLabel>Expires (optional)</FieldLabel>
          <TextInput
            onChange={(e) => setExpiresAt(e.target.value)}
            type="date"
            value={expiresAt}
          />
        </div>

        {error && <ErrorText>{error}</ErrorText>}

        <div className="flex gap-2">
          <PrimaryButton disabled={isLoading} type="submit">
            {isLoading ? 'Creating...' : 'Create key'}
          </PrimaryButton>
          <SecondaryButton onClick={onDone} type="button">
            Cancel
          </SecondaryButton>
        </div>
      </form>
    </Card>
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
      const result = await rotate(streamKey.id).unwrap();
      setRotated(result);
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
    <Card className="p-4">
      {rotated && <RevealedKeyBanner created={rotated} onDismiss={() => setRotated(null)} />}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <KeyRound aria-hidden="true" className="size-4 text-muted" />
            <code className="text-sm font-bold text-ink">{streamKey.keyPrefix}...</code>
          </div>
          <p className="mt-1 text-xs text-muted">
            {streamKey.deckId ? 'Deck-scoped' : 'Org-wide'} -- {streamKey.scopes.join(', ')}
          </p>
          <p className="mt-1 text-xs text-muted">
            Last used: {streamKey.lastUsedAt ? new Date(streamKey.lastUsedAt).toLocaleString() : 'never'}
            {streamKey.expiresAt && ` -- Expires: ${new Date(streamKey.expiresAt).toLocaleDateString()}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${status.className}`}>
            {status.label}
          </span>
          {!streamKey.revokedAt && (
            <>
              <SecondaryButton disabled={isRotating} onClick={handleRotate} type="button">
                <RotateCw aria-hidden="true" className="size-3.5" />
                Rotate
              </SecondaryButton>
              <SecondaryButton disabled={isRevoking} onClick={handleRevoke} type="button">
                <Trash2 aria-hidden="true" className="size-3.5" />
                Revoke
              </SecondaryButton>
            </>
          )}
        </div>
      </div>
      {error && <div className="mt-2">{<ErrorText>{error}</ErrorText>}</div>}
    </Card>
  );
}

export default function ApiKeysPage() {
  const { data: keys, isLoading } = useListStreamKeysQuery();
  const [showForm, setShowForm] = useState(false);
  const [created, setCreated] = useState<CreatedStreamApiKey | null>(null);

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <PageHeading
          subtitle="Credentials external and programmatic clients use to pull data from Voice Stream -- not for browser/dashboard sign-in."
          title="API Keys"
        />
        {!showForm && (
          <PrimaryButton onClick={() => setShowForm(true)} type="button">
            <Plus aria-hidden="true" className="size-4" />
            New key
          </PrimaryButton>
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
        <p className="text-sm text-muted">Loading...</p>
      ) : keys && keys.length > 0 ? (
        <div className="grid gap-3">
          {keys.map((key) => (
            <KeyRow key={key.id} streamKey={key} />
          ))}
        </div>
      ) : (
        <Card className="p-8 text-center text-sm text-muted">
          No API keys yet. Create one to give an external client access to your Stream Decks.
        </Card>
      )}
    </div>
  );
}

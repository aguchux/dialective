'use client';

import { FormEvent, useState } from 'react';
import { KeyRound, Plus, Trash2 } from 'lucide-react';
import {
  CreatedOAuthClient,
  OAuthClientSummary,
  StreamKeyScope,
  useCreateOAuthClientMutation,
  useListOAuthClientsQuery,
  useListStreamDecksQuery,
  useRevokeOAuthClientMutation,
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

function RevealedSecretBanner({
  created,
  onDismiss,
}: {
  created: CreatedOAuthClient;
  onDismiss: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(created.plaintextSecret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="rounded-lg border border-catalogue-blue/40 bg-catalogue-blue/10 p-4">
      <p className="mb-2 text-sm font-bold text-catalogue-blue-bright">
        Copy this client secret now -- it will not be shown again.
      </p>
      <div className="mb-3 grid gap-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-catalogue-muted">
            Client ID
          </p>
          <code className="mt-1 block break-all rounded-lg border border-catalogue-line bg-catalogue-bg px-3 py-2 text-sm text-catalogue-ink">
            {created.clientId}
          </code>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-catalogue-muted">
            Client Secret
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded-lg border border-catalogue-line bg-catalogue-bg px-3 py-2 text-sm text-catalogue-ink">
              {created.plaintextSecret}
            </code>
            <SettingsPrimaryButton onClick={() => void copy()}>
              {copied ? 'Copied' : 'Copy'}
            </SettingsPrimaryButton>
          </div>
        </div>
      </div>
      <p className="mb-3 text-xs text-catalogue-dim">
        Exchange these for a short-lived access token:{' '}
        <code className="rounded bg-catalogue-bg px-1 py-0.5">POST /stream/v1/oauth/token</code>{' '}
        with{' '}
        <code className="rounded bg-catalogue-bg px-1 py-0.5">grant_type=client_credentials</code>.
      </p>
      <SettingsSecondaryButton onClick={onDismiss}>Done</SettingsSecondaryButton>
    </div>
  );
}

function CreateClientForm({
  onCreated,
  onDone,
}: {
  onCreated: (client: CreatedOAuthClient) => void;
  onDone: () => void;
}) {
  const { data: decks } = useListStreamDecksQuery();
  const [createClient, { isLoading }] = useCreateOAuthClientMutation();
  const [deckId, setDeckId] = useState('');
  const [scopes, setScopes] = useState<StreamKeyScope[]>([]);
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
      const result = await createClient({ deckId: deckId || undefined, scopes }).unwrap();
      onCreated(result);
    } catch (err: any) {
      setError(err?.data?.message ?? 'Unable to create this OAuth client.');
    }
  }

  return (
    <form
      className="grid gap-3 rounded-lg border border-catalogue-line bg-catalogue-bg p-4"
      onSubmit={submit}
    >
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
              <input
                checked={scopes.includes(scope.value)}
                onChange={() => toggleScope(scope.value)}
                type="checkbox"
              />
              {scope.label}
            </label>
          ))}
        </div>
      </SettingsField>
      {error && <SettingsErrorText>{error}</SettingsErrorText>}
      <div className="flex gap-2">
        <SettingsPrimaryButton disabled={isLoading} type="submit">
          {isLoading ? 'Creating...' : 'Create client'}
        </SettingsPrimaryButton>
        <SettingsSecondaryButton onClick={onDone}>Cancel</SettingsSecondaryButton>
      </div>
    </form>
  );
}

function ClientRow({ client }: { client: OAuthClientSummary }) {
  const [revoke, { isLoading: isRevoking }] = useRevokeOAuthClientMutation();
  const [error, setError] = useState<string | null>(null);

  async function handleRevoke() {
    setError(null);
    try {
      await revoke(client.id).unwrap();
    } catch (err: any) {
      setError(err?.data?.message ?? 'Unable to revoke this client.');
    }
  }

  return (
    <div className="rounded-lg border border-catalogue-line bg-catalogue-bg p-3.5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <KeyRound aria-hidden="true" className="size-4 text-catalogue-dim" />
            <code className="text-sm font-bold text-catalogue-ink">{client.clientId}</code>
          </div>
          <p className="mt-1 text-xs text-catalogue-muted">
            {client.deckId ? 'Deck-scoped' : 'Org-wide'} -- {client.scopes.join(', ')}
          </p>
          <p className="mt-1 text-xs text-catalogue-dim">
            Created {new Date(client.createdAt).toLocaleDateString()}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${
              client.revokedAt
                ? 'bg-danger/15 text-danger'
                : 'bg-catalogue-green/15 text-catalogue-green'
            }`}
          >
            {client.revokedAt ? 'Revoked' : 'Active'}
          </span>
          {!client.revokedAt && (
            <SettingsSecondaryButton disabled={isRevoking} onClick={() => void handleRevoke()}>
              <Trash2 aria-hidden="true" className="size-3.5" />
            </SettingsSecondaryButton>
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

export function OAuthClientsSection() {
  const { data: clients, isLoading } = useListOAuthClientsQuery();
  const [showForm, setShowForm] = useState(false);
  const [created, setCreated] = useState<CreatedOAuthClient | null>(null);

  return (
    <SettingsCard
      description="OAuth2 client_credentials clients for machine-to-machine integrations."
      title="OAuth Clients"
    >
      <div className="flex items-center justify-end gap-3">
        {!showForm && (
          <SettingsPrimaryButton onClick={() => setShowForm(true)}>
            <Plus aria-hidden="true" className="size-4" />
            New client
          </SettingsPrimaryButton>
        )}
      </div>

      {created && <RevealedSecretBanner created={created} onDismiss={() => setCreated(null)} />}

      {showForm && (
        <CreateClientForm
          onCreated={(client) => {
            setCreated(client);
            setShowForm(false);
          }}
          onDone={() => setShowForm(false)}
        />
      )}

      {isLoading ? (
        <Skeleton className="h-16 w-full" />
      ) : clients && clients.length > 0 ? (
        <div className="grid gap-2.5">
          {clients.map((client) => (
            <ClientRow client={client} key={client.id} />
          ))}
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-catalogue-line-strong p-4 text-center text-sm text-catalogue-muted">
          No OAuth clients yet.
        </p>
      )}
    </SettingsCard>
  );
}

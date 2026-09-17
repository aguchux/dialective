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
import {
  Card,
  ErrorText,
  FieldLabel,
  PageHeading,
  PrimaryButton,
  SecondaryButton,
} from '@/components/ui';

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
    <Card className="mb-6 border-accent bg-accent-soft p-5">
      <p className="mb-2 text-sm font-bold text-accent-dark">
        Copy this client secret now -- it will not be shown again.
      </p>
      <div className="mb-3 grid gap-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-muted">Client ID</p>
          <code className="mt-1 block break-all rounded-lg border border-line bg-white px-3 py-2 text-sm">
            {created.clientId}
          </code>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-muted">Client Secret</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded-lg border border-line bg-white px-3 py-2 text-sm">
              {created.plaintextSecret}
            </code>
            <PrimaryButton onClick={copy} type="button">
              {copied ? 'Copied' : 'Copy'}
            </PrimaryButton>
          </div>
        </div>
      </div>
      <p className="mb-3 text-xs text-muted">
        Exchange these for a short-lived access token:{' '}
        <code className="rounded bg-white px-1 py-0.5">POST /stream/v1/oauth/token</code> with{' '}
        <code className="rounded bg-white px-1 py-0.5">grant_type=client_credentials</code>.
      </p>
      <SecondaryButton onClick={onDismiss} type="button">
        Done
      </SecondaryButton>
    </Card>
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

        {error && <ErrorText>{error}</ErrorText>}

        <div className="flex gap-2">
          <PrimaryButton disabled={isLoading} type="submit">
            {isLoading ? 'Creating...' : 'Create client'}
          </PrimaryButton>
          <SecondaryButton onClick={onDone} type="button">
            Cancel
          </SecondaryButton>
        </div>
      </form>
    </Card>
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
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <KeyRound aria-hidden="true" className="size-4 text-muted" />
            <code className="text-sm font-bold text-ink">{client.clientId}</code>
          </div>
          <p className="mt-1 text-xs text-muted">
            {client.deckId ? 'Deck-scoped' : 'Org-wide'} -- {client.scopes.join(', ')}
          </p>
          <p className="mt-1 text-xs text-muted">
            Created {new Date(client.createdAt).toLocaleDateString()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-bold ${
              client.revokedAt ? 'bg-danger/10 text-danger' : 'bg-accent/10 text-accent-dark'
            }`}
          >
            {client.revokedAt ? 'Revoked' : 'Active'}
          </span>
          {!client.revokedAt && (
            <SecondaryButton disabled={isRevoking} onClick={handleRevoke} type="button">
              <Trash2 aria-hidden="true" className="size-3.5" />
              Revoke
            </SecondaryButton>
          )}
        </div>
      </div>
      {error && <div className="mt-2">{<ErrorText>{error}</ErrorText>}</div>}
    </Card>
  );
}

export default function OAuthClientsPage() {
  const { data: clients, isLoading } = useListOAuthClientsQuery();
  const [showForm, setShowForm] = useState(false);
  const [created, setCreated] = useState<CreatedOAuthClient | null>(null);

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <PageHeading
          subtitle="OAuth2 client_credentials clients for machine-to-machine integrations -- exchange a client_id/client_secret for a short-lived access token, an alternative to API Keys for integrators using standard OAuth2 tooling."
          title="OAuth Clients"
        />
        {!showForm && (
          <PrimaryButton onClick={() => setShowForm(true)} type="button">
            <Plus aria-hidden="true" className="size-4" />
            New client
          </PrimaryButton>
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
        <p className="text-sm text-muted">Loading...</p>
      ) : clients && clients.length > 0 ? (
        <div className="grid gap-3">
          {clients.map((client) => (
            <ClientRow client={client} key={client.id} />
          ))}
        </div>
      ) : (
        <Card className="p-8 text-center text-sm text-muted">
          No OAuth clients yet. Create one to give an external client client_credentials-based
          access to your Stream Decks.
        </Card>
      )}
    </div>
  );
}

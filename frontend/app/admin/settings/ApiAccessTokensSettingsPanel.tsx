'use client';

import { useState } from 'react';
import {
  ApiAccessTokenSummary,
  normalizeErrorMessage,
  useDeleteApiAccessTokenMutation,
  useGetApiAccessTokensQuery,
  useSetApiAccessTokenMutation,
} from '@/store/api';
import { ActionButton } from '@/components/ui/ActionButton';

const primaryButtonClass =
  'inline-flex min-h-10 items-center justify-center rounded-lg border border-accent bg-accent px-3.5 py-2.5 font-bold text-white transition-colors hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60';
const dangerButtonClass =
  'inline-flex min-h-10 items-center justify-center rounded-lg border border-line bg-white px-3.5 py-2.5 font-bold text-danger transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60';

const TOKEN_LABELS: Record<string, { label: string; description: string }> = {
  huggingface: {
    label: 'Hugging Face',
    description:
      'Used by whisper-worker to download gated ASR checkpoints (e.g. NCAIR1/Igbo-ASR, NCAIR1/Yoruba-ASR, NCAIR1/Hausa-ASR). Must belong to an account with approved access to those repos, or ASR transcription silently fails for every dialect routed through Whisper.',
  },
};

function TokenRow({ token }: { token: ApiAccessTokenSummary }) {
  const [setToken, { isLoading: isSaving }] = useSetApiAccessTokenMutation();
  const [deleteToken, { isLoading: isDeleting }] = useDeleteApiAccessTokenMutation();
  const [value, setValue] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const meta = TOKEN_LABELS[token.key] ?? { label: token.key, description: '' };

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setError(null);
    try {
      await setToken({ key: token.key, value }).unwrap();
      setValue('');
      setMessage('Token saved.');
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to save token.'));
    }
  }

  async function handleRemove() {
    setMessage(null);
    setError(null);
    try {
      await deleteToken(token.key).unwrap();
      setMessage('Token removed.');
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to remove token.'));
    }
  }

  return (
    <div className="grid gap-3 rounded-lg border border-line bg-surface-muted p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-bold">{meta.label}</p>
          {meta.description && (
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted">{meta.description}</p>
          )}
        </div>
        <span
          className={`shrink-0 rounded-full px-3 py-1 text-sm font-bold ${
            token.isSet ? 'bg-accent/10 text-accent-dark' : 'bg-danger/10 text-danger'
          }`}
        >
          {token.isSet ? `Set (...${token.lastFour})` : 'Not set'}
        </span>
      </div>

      {token.isSet && token.updatedAt && (
        <p className="text-sm text-muted">
          Last updated {new Date(token.updatedAt).toLocaleString()}
          {token.updatedByEmail ? ` by ${token.updatedByEmail}` : ''}
        </p>
      )}

      <form className="flex flex-wrap items-center gap-2" onSubmit={handleSave}>
        <input
          className="min-w-0 flex-1 rounded-lg border border-line px-3 py-2.5"
          onChange={(e) => setValue(e.target.value)}
          placeholder={token.isSet ? 'Enter a new value to rotate this token' : 'Paste token value'}
          type="password"
          value={value}
        />
        <ActionButton
          className={primaryButtonClass}
          disabled={!value.trim()}
          pending={isSaving}
          pendingLabel="Saving"
          type="submit"
        >
          {token.isSet ? 'Rotate' : 'Save'}
        </ActionButton>
        {token.isSet && (
          <ActionButton
            className={dangerButtonClass}
            onClick={handleRemove}
            pending={isDeleting}
            pendingLabel="Removing"
            type="button"
          >
            Remove
          </ActionButton>
        )}
      </form>

      {message && <p className="text-sm leading-relaxed text-accent-dark">{message}</p>}
      {error && (
        <p className="text-sm leading-relaxed text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function ApiAccessTokensSettingsPanel() {
  const { data: tokens, isLoading } = useGetApiAccessTokensQuery();

  return (
    <section className="grid gap-4 rounded-lg border border-line bg-white p-5 shadow-[0_2px_8px_rgba(27,31,27,0.05)]">
      <div className="grid gap-1">
        <h2 className="text-2xl leading-snug">API Access Tokens</h2>
        <p className="leading-relaxed text-muted">
          Third-party API credentials used by backend workers, rotatable here instead of via a
          Kubernetes secret and redeploy. Values are encrypted at rest and never shown again after
          saving -- only the last 4 characters are displayed to confirm which token is active.
        </p>
      </div>

      {isLoading && <p className="text-muted">Loading...</p>}
      {!isLoading && (
        <div className="grid gap-4">
          {tokens?.map((token) => (
            <TokenRow key={token.key} token={token} />
          ))}
        </div>
      )}
    </section>
  );
}

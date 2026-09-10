'use client';

import { FormEvent, useEffect, useState } from 'react';
import {
  normalizeErrorMessage,
  useGetPlatformSettingsQuery,
  useUpdatePlatformSettingsMutation,
} from '@/store/api';
import { ActionButton } from '@/components/ui/ActionButton';

const primaryButtonClass =
  'inline-flex min-h-10 items-center justify-center rounded-lg border border-accent bg-accent px-3.5 py-2.5 font-bold text-white transition-colors hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60';

/**
 * Voice Stream (the separate stream.dialectlibrary.com subscriber app) has
 * its own onboarding gate, distinct from the trainer platform's
 * registerRateLimitPerHour/authMaintenance settings on the General tab --
 * kept in its own tab rather than folded into General so Stream-specific
 * settings have one home as more get added.
 */
export function StreamSettingsPanel() {
  const { data: settings, isLoading } = useGetPlatformSettingsQuery();
  const [updateSettings, { isLoading: isSaving }] = useUpdatePlatformSettingsMutation();

  const [selfServeSignupEnabled, setSelfServeSignupEnabled] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!settings) return;
    setSelfServeSignupEnabled(settings.streamSelfServeSignupEnabled);
  }, [settings]);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    setError(null);
    try {
      await updateSettings({
        streamSelfServeSignupEnabled: selfServeSignupEnabled,
      }).unwrap();
      setMessage('Stream settings saved.');
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to save Stream settings.'));
    }
  }

  return (
    <section className="grid gap-4 rounded-lg border border-line bg-white p-5 shadow-[0_2px_8px_rgba(27,31,27,0.05)]">
      <div className="grid gap-1">
        <h2 className="text-2xl leading-snug">Stream settings</h2>
        <p className="leading-relaxed text-muted">
          Onboarding controls for Dialect Library Voice Stream (the subscriber-facing dataset
          licensing app), separate from the trainer platform's own settings elsewhere on this
          page.
        </p>
      </div>

      {isLoading && <p className="text-muted">Loading...</p>}
      {!isLoading && (
        <form className="grid max-w-xl gap-4" onSubmit={handleSave}>
          <div>
            <label
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-surface-muted p-4"
              htmlFor="stream-self-serve-signup"
            >
              <input
                checked={selfServeSignupEnabled}
                className="mt-0.5 size-5 accent-accent"
                id="stream-self-serve-signup"
                onChange={(event) => setSelfServeSignupEnabled(event.target.checked)}
                type="checkbox"
              />
              <span>
                <span className="block font-bold">Allow self-serve signup</span>
                <span className="mt-1 block text-sm leading-relaxed text-muted">
                  When on, the Voice Stream /register page lets anyone create an account directly
                  (email/password, then verify by emailed code) instead of requiring an admin
                  invite first. When off (default), Stream stays admin-invite-only and /register
                  only collects a &quot;Request access&quot; lead for admin follow-up -- from
                  there, use Approve &amp; invite or Resend invite on the{' '}
                  <a className="font-bold text-accent hover:text-accent-dark" href="/admin/data-access">
                    Stream Requests
                  </a>{' '}
                  page.
                </span>
              </span>
            </label>
          </div>

          <div>
            <ActionButton
              className={primaryButtonClass}
              pending={isSaving}
              pendingLabel="Saving"
              type="submit"
            >
              Save Stream settings
            </ActionButton>
          </div>
        </form>
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

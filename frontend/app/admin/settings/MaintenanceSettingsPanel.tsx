'use client';

import { useEffect, useState } from 'react';
import { normalizeErrorMessage, useGetPlatformSettingsQuery, useUpdatePlatformSettingsMutation } from '@/store/api';
import { ActionButton } from '@/components/ui/ActionButton';
import { useCountdown } from '@/lib/use-countdown';

const inputClass = 'min-h-10 w-full rounded-lg border border-line bg-white px-3 py-2.5 text-ink dark:bg-surface-muted';
const primaryButtonClass =
  'inline-flex min-h-10 items-center justify-center rounded-lg border border-accent bg-accent px-3.5 py-2.5 font-bold text-white transition-colors hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60';
const dangerButtonClass =
  'inline-flex min-h-10 items-center justify-center rounded-lg border border-danger bg-white px-3.5 py-2.5 font-bold text-danger transition-colors hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-60';

// <input type="datetime-local"> wants "YYYY-MM-DDTHH:mm" in local time, no
// timezone/seconds -- neither Date#toISOString() nor a raw ISO string from
// the API is in that shape, so this converts in both directions.
function toDatetimeLocalValue(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function MaintenanceSettingsPanel() {
  const [enabled, setEnabled] = useState(false);
  const [until, setUntil] = useState('');
  const [note, setNote] = useState('');
  const [blockLogin, setBlockLogin] = useState(true);
  const [blockSignup, setBlockSignup] = useState(true);
  const [blockSessions, setBlockSessions] = useState(false);
  const [excludeAdmin, setExcludeAdmin] = useState(true);
  const [excludePartner, setExcludePartner] = useState(false);
  const [registerRateLimitPerHour, setRegisterRateLimitPerHour] = useState('30');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: platformSettings, isLoading } = useGetPlatformSettingsQuery();
  const [updatePlatformSettings, { isLoading: isSaving }] = useUpdatePlatformSettingsMutation();

  useEffect(() => {
    if (!platformSettings) return;
    setEnabled(platformSettings.authMaintenanceEnabled);
    setUntil(toDatetimeLocalValue(platformSettings.authMaintenanceUntil));
    setNote(platformSettings.authMaintenanceMessage ?? '');
    setBlockLogin(platformSettings.authMaintenanceBlockLogin);
    setBlockSignup(platformSettings.authMaintenanceBlockSignup);
    setBlockSessions(platformSettings.authMaintenanceBlockSessions);
    setExcludeAdmin(platformSettings.authMaintenanceExcludeAdmin);
    setExcludePartner(platformSettings.authMaintenanceExcludePartner);
    setRegisterRateLimitPerHour(String(platformSettings.registerRateLimitPerHour));
  }, [platformSettings]);

  const liveUntil = platformSettings?.authMaintenanceEnabled ? platformSettings.authMaintenanceUntil : null;
  const countdown = useCountdown(liveUntil);
  const noScopeSelected = !blockLogin && !blockSignup && !blockSessions;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setError(null);

    if (enabled && !until) {
      setError('Set a date and time maintenance ends before turning it on.');
      return;
    }
    if (enabled && noScopeSelected) {
      setError('Check at least one of login, signup, or sessions to block.');
      return;
    }

    try {
      await updatePlatformSettings({
        authMaintenanceEnabled: enabled,
        authMaintenanceUntil: enabled ? new Date(until).toISOString() : null,
        authMaintenanceMessage: enabled ? note.trim() || undefined : null,
        authMaintenanceBlockLogin: blockLogin,
        authMaintenanceBlockSignup: blockSignup,
        authMaintenanceBlockSessions: blockSessions,
        authMaintenanceExcludeAdmin: excludeAdmin,
        authMaintenanceExcludePartner: excludePartner,
      }).unwrap();
      setMessage(enabled ? 'Maintenance mode is on for the scopes checked below.' : 'Maintenance mode turned off.');
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to save maintenance settings.'));
    }
  }

  async function handleSaveRateLimit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setError(null);
    const limit = Number(registerRateLimitPerHour);
    if (!Number.isInteger(limit) || limit < 1) {
      setError('Enter a whole number of at least 1.');
      return;
    }
    try {
      await updatePlatformSettings({ registerRateLimitPerHour: limit }).unwrap();
      setMessage('Sign-up rate limit updated.');
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to save the sign-up rate limit.'));
    }
  }

  async function handleEndNow() {
    setMessage(null);
    setError(null);
    try {
      await updatePlatformSettings({
        authMaintenanceEnabled: false,
        authMaintenanceUntil: null,
        authMaintenanceMessage: null,
      }).unwrap();
      setEnabled(false);
      setUntil('');
      setNote('');
      setMessage('Maintenance mode turned off. Everything is back up.');
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to turn off maintenance mode.'));
    }
  }

  return (
    <section className="grid gap-4 rounded-lg border border-line bg-white p-5 shadow-[0_2px_8px_rgba(27,31,27,0.05)]">
      <div className="grid gap-1">
        <h2 className="text-2xl leading-snug">Login &amp; signup maintenance</h2>
        <p className="leading-relaxed text-muted">
          Temporarily stop authentication for scheduled maintenance. Choose exactly what gets blocked below -- new
          logins, new signups, and/or every currently-signed-in session.
        </p>
      </div>

      {isLoading && <p className="text-muted">Loading...</p>}
      {!isLoading && (
        <>
          {platformSettings?.authMaintenanceEnabled && (
            <div className="grid gap-1 rounded-lg border border-warning bg-warning/10 p-4">
              <p className="font-bold text-warning">Maintenance is live right now</p>
              <p className="text-sm leading-relaxed text-warning">
                Scheduled to automatically resume in{' '}
                <span className="font-bold tabular-nums">{countdown.label}</span>
                {platformSettings.authMaintenanceUntil && (
                  <> (at {new Date(platformSettings.authMaintenanceUntil).toLocaleString()}).</>
                )}
              </p>
              <div className="mt-2">
                <ActionButton className={dangerButtonClass} type="button" onClick={handleEndNow} pending={isSaving} pendingLabel="Ending">
                  End maintenance now
                </ActionButton>
              </div>
            </div>
          )}

          <form className="grid gap-4 md:max-w-xl" onSubmit={handleSave}>
            <label className="flex items-center gap-3 rounded-lg border border-line bg-surface p-4">
              <input
                type="checkbox"
                className="h-5 w-5 accent-accent"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
              />
              <span>
                <span className="block font-bold">Enable scheduled maintenance</span>
                <span className="block text-sm leading-relaxed text-muted">
                  While on, the checked scopes below are blocked until the scheduled time.
                </span>
              </span>
            </label>

            <fieldset className="grid gap-2 rounded-lg border border-line bg-surface p-4" disabled={!enabled}>
              <legend className="px-1 font-bold">What to block</legend>

              <label className="flex items-start gap-3 py-1">
                <input
                  type="checkbox"
                  className="mt-0.5 h-5 w-5 accent-accent"
                  checked={blockLogin}
                  onChange={(e) => setBlockLogin(e.target.checked)}
                />
                <span>
                  <span className="block font-bold">Login</span>
                  <span className="block text-sm leading-relaxed text-muted">New sign-in attempts are rejected.</span>
                </span>
              </label>

              <label className="flex items-start gap-3 py-1">
                <input
                  type="checkbox"
                  className="mt-0.5 h-5 w-5 accent-accent"
                  checked={blockSignup}
                  onChange={(e) => setBlockSignup(e.target.checked)}
                />
                <span>
                  <span className="block font-bold">Signup</span>
                  <span className="block text-sm leading-relaxed text-muted">
                    New registrations and magic-link requests are rejected.
                  </span>
                </span>
              </label>

              <label className="flex items-start gap-3 py-1">
                <input
                  type="checkbox"
                  className="mt-0.5 h-5 w-5 accent-accent"
                  checked={blockSessions}
                  onChange={(e) => setBlockSessions(e.target.checked)}
                />
                <span>
                  <span className="block font-bold">Active sessions</span>
                  <span className="block text-sm leading-relaxed text-muted">
                    Everyone currently signed in is logged out immediately, not just new attempts.
                  </span>
                </span>
              </label>

              {blockSessions && (
                <div className="mt-2 grid gap-2 rounded-lg border border-line bg-white p-3 dark:bg-surface-muted">
                  <p className="text-sm font-bold">Exclude from the session block</p>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-accent"
                      checked={excludeAdmin}
                      onChange={(e) => setExcludeAdmin(e.target.checked)}
                    />
                    <span className="text-sm">Admins (recommended, so you can end maintenance early)</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-accent"
                      checked={excludePartner}
                      onChange={(e) => setExcludePartner(e.target.checked)}
                    />
                    <span className="text-sm">Partners</span>
                  </label>
                </div>
              )}

              {noScopeSelected && (
                <p className="text-sm leading-relaxed text-danger">Check at least one scope to block.</p>
              )}
            </fieldset>

            <div>
              <label htmlFor="maintenance-until">Back up at</label>
              <input
                className={inputClass}
                id="maintenance-until"
                type="datetime-local"
                value={until}
                onChange={(e) => setUntil(e.target.value)}
                required={enabled}
                disabled={!enabled}
              />
              <p className="mt-1 text-sm leading-relaxed text-muted">
                Everything automatically comes back on at this time, even if nobody remembers to flip the toggle off
                -- the backend clears it the moment this time passes.
              </p>
            </div>

            <div>
              <label htmlFor="maintenance-message">Message shown to visitors (optional)</label>
              <textarea
                className={`${inputClass} min-h-24`}
                id="maintenance-message"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={280}
                disabled={!enabled}
                placeholder="We're upgrading our systems and will be back shortly."
              />
            </div>

            <div>
              <ActionButton className={primaryButtonClass} type="submit" pending={isSaving} pendingLabel="Saving">
                Save settings
              </ActionButton>
            </div>
          </form>

          <form className="grid gap-3 border-t border-line pt-4 md:max-w-xl" onSubmit={handleSaveRateLimit}>
            <div className="grid gap-1">
              <label htmlFor="register-rate-limit">Sign-up rate limit</label>
              <input
                className={`${inputClass} max-w-40`}
                id="register-rate-limit"
                inputMode="numeric"
                min={1}
                onChange={(e) => setRegisterRateLimitPerHour(e.target.value)}
                type="number"
                value={registerRateLimitPerHour}
              />
              <p className="text-sm leading-relaxed text-muted">
                Max registration attempts allowed per hour from the same IP address, before that IP sees
                &ldquo;Too many requests&rdquo;. A shared office/carrier network can trip a low limit during normal
                sign-up retries -- raise this if trainers report being blocked. Takes effect immediately, no
                deploy needed.
              </p>
            </div>
            <div>
              <ActionButton className={primaryButtonClass} pending={isSaving} pendingLabel="Saving" type="submit">
                Save rate limit
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

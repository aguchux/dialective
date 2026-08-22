'use client';

import { useEffect, useState } from 'react';
import { normalizeErrorMessage, useGetPlatformSettingsQuery, useUpdatePlatformSettingsMutation } from '@/store/api';
import { ActionButton } from '@/components/ui/ActionButton';

const primaryButtonClass =
  'inline-flex min-h-10 items-center justify-center rounded-lg border border-accent bg-accent px-3.5 py-2.5 font-bold text-white transition-colors hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60';

export function SpeechExpressionSettingsPanel() {
  const { data: settings, isLoading } = useGetPlatformSettingsQuery();
  const [updateSettings, { isLoading: isSaving }] = useUpdatePlatformSettingsMutation();

  const [enabled, setEnabled] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!settings) return;
    setEnabled(settings.speechExpressionEnabled);
  }, [settings]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setError(null);

    try {
      await updateSettings({ speechExpressionEnabled: enabled }).unwrap();
      setMessage('Speech expression settings saved.');
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to save speech expression settings.'));
    }
  }

  return (
    <section className="grid gap-4 rounded-lg border border-line bg-white p-5 shadow-[0_2px_8px_rgba(27,31,27,0.05)]">
      <div className="grid gap-1">
        <h2 className="text-2xl leading-snug">Speech Expression Analysis</h2>
        <p className="leading-relaxed text-muted">
          Optionally analyzes each recording&rsquo;s emotion, tone, style, speed, and energy (quality-gate-worker),
          for future dataset use (expressive TTS, emotion-aware training, pronunciation analysis). This is purely
          descriptive metadata -- unlike the Voice Quality Gate, it{' '}
          <strong>never affects the composite score or payout</strong>, no matter how it&rsquo;s configured.
        </p>
      </div>

      {isLoading && <p className="text-muted">Loading...</p>}
      {!isLoading && (
        <form className="grid gap-4 md:max-w-md" onSubmit={handleSave}>
          <div>
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-surface-muted p-4" htmlFor="speech-expression-enabled">
              <input
                checked={enabled}
                className="mt-0.5 size-5 accent-accent"
                id="speech-expression-enabled"
                onChange={(event) => setEnabled(event.target.checked)}
                type="checkbox"
              />
              <span>
                <span className="block font-bold">Analyze emotion &amp; prosody</span>
                <span className="mt-1 block text-sm leading-relaxed text-muted">
                  When off (default), the analysis is skipped entirely for every recording, saving the extra
                  processing cost. When on, results appear in the admin Recordings table.
                </span>
              </span>
            </label>
          </div>

          <div>
            <ActionButton className={primaryButtonClass} type="submit" pending={isSaving} pendingLabel="Saving">
              Save speech expression settings
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

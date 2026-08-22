'use client';

import { useEffect, useState } from 'react';
import {
  normalizeErrorMessage,
  useGetPlatformSettingsQuery,
  useUpdatePlatformSettingsMutation,
} from '@/store/api';
import { ActionButton } from '@/components/ui/ActionButton';

const primaryButtonClass =
  'inline-flex min-h-10 items-center justify-center rounded-lg border border-accent bg-accent px-3.5 py-2.5 font-bold text-white transition-colors hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60';

const STAT_TOGGLES = [
  { key: 'countries' as const, label: 'Countries', detail: 'Active countries card' },
  { key: 'dialects' as const, label: 'Dialects', detail: 'Active tracks card' },
  { key: 'trainers' as const, label: 'Trainers', detail: 'Registered contributors card' },
  { key: 'poolVolume' as const, label: 'Pool Volume', detail: 'Reward pool balance card' },
  { key: 'payout' as const, label: 'Payout', detail: 'Total earned by contributors card' },
];

type ToggleKey = (typeof STAT_TOGGLES)[number]['key'];

export function LandingPageSettingsPanel() {
  const { data: settings, isLoading } = useGetPlatformSettingsQuery();
  const [updateSettings, { isLoading: isSaving }] = useUpdatePlatformSettingsMutation();

  const [visible, setVisible] = useState<Record<ToggleKey, boolean>>({
    countries: true,
    dialects: true,
    trainers: true,
    poolVolume: true,
    payout: true,
  });
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!settings) return;
    setVisible({
      countries: settings.landingShowCountries,
      dialects: settings.landingShowDialects,
      trainers: settings.landingShowTrainers,
      poolVolume: settings.landingShowPoolVolume,
      payout: settings.landingShowPayout,
    });
  }, [settings]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setError(null);
    try {
      await updateSettings({
        landingShowCountries: visible.countries,
        landingShowDialects: visible.dialects,
        landingShowTrainers: visible.trainers,
        landingShowPoolVolume: visible.poolVolume,
        landingShowPayout: visible.payout,
      }).unwrap();
      setMessage('Landing page settings saved.');
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to save landing page settings.'));
    }
  }

  return (
    <section className="grid gap-4 rounded-lg border border-line bg-white p-5 shadow-[0_2px_8px_rgba(27,31,27,0.05)]">
      <div className="grid gap-1">
        <h2 className="text-2xl leading-snug">Landing Page</h2>
        <p className="leading-relaxed text-muted">
          Show or hide each stat card in the marketing landing page&rsquo;s metrics row. Hiding a
          card only affects display &mdash; the underlying figures are still tracked and available
          everywhere else (this settings panel, the admin dashboard).
        </p>
      </div>

      {isLoading && <p className="text-muted">Loading...</p>}
      {!isLoading && (
        <form className="grid gap-4 md:max-w-md" onSubmit={handleSave}>
          <div className="grid gap-2">
            {STAT_TOGGLES.map((toggle) => (
              <label
                className="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-surface-muted p-4"
                htmlFor={`landing-show-${toggle.key}`}
                key={toggle.key}
              >
                <input
                  checked={visible[toggle.key]}
                  className="mt-0.5 size-5 accent-accent"
                  id={`landing-show-${toggle.key}`}
                  onChange={(event) =>
                    setVisible((current) => ({ ...current, [toggle.key]: event.target.checked }))
                  }
                  type="checkbox"
                />
                <span>
                  <span className="block font-bold">{toggle.label}</span>
                  <span className="mt-1 block text-sm leading-relaxed text-muted">
                    {toggle.detail}
                  </span>
                </span>
              </label>
            ))}
          </div>

          <div>
            <ActionButton
              className={primaryButtonClass}
              type="submit"
              pending={isSaving}
              pendingLabel="Saving"
            >
              Save landing page settings
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

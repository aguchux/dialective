'use client';

import { useEffect, useState } from 'react';
import {
  normalizeErrorMessage,
  useGetPlatformSettingsQuery,
  useUpdatePlatformSettingsMutation,
} from '@/store/api';
import { ActionButton } from '@/components/ui/ActionButton';

const inputClass =
  'min-h-10 w-full rounded-lg border border-line bg-white px-3 py-2.5 text-ink dark:bg-surface-muted';
const primaryButtonClass =
  'inline-flex min-h-10 items-center justify-center rounded-lg border border-accent bg-accent px-3.5 py-2.5 font-bold text-white transition-colors hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60';

export function TestimonySettingsPanel() {
  const { data: settings, isLoading } = useGetPlatformSettingsQuery();
  const [updateSettings, { isLoading: isSaving }] = useUpdatePlatformSettingsMutation();

  const [enabled, setEnabled] = useState(false);
  const [maxTextLength, setMaxTextLength] = useState('200');
  const [maxVideoSeconds, setMaxVideoSeconds] = useState('30');
  const [rewardTokens, setRewardTokens] = useState('5');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!settings) return;
    setEnabled(settings.testimonyEnabled);
    setMaxTextLength(String(settings.testimonyMaxTextLength));
    setMaxVideoSeconds(String(settings.testimonyMaxVideoSeconds));
    setRewardTokens(settings.testimonyRewardTokens);
  }, [settings]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setError(null);

    const textLength = Number(maxTextLength);
    const videoSeconds = Number(maxVideoSeconds);
    const reward = Number(rewardTokens);
    if (!Number.isFinite(textLength) || textLength < 1) {
      setError('Max text length must be a positive number.');
      return;
    }
    if (!Number.isFinite(videoSeconds) || videoSeconds < 1) {
      setError('Max video seconds must be a positive number.');
      return;
    }
    if (!Number.isFinite(reward) || reward < 0) {
      setError('Reward tokens must be zero or a positive number.');
      return;
    }

    try {
      await updateSettings({
        testimonyEnabled: enabled,
        testimonyMaxTextLength: textLength,
        testimonyMaxVideoSeconds: videoSeconds,
        testimonyRewardTokens: reward,
      }).unwrap();
      setMessage('Testimony settings saved.');
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to save testimony settings.'));
    }
  }

  return (
    <section className="grid gap-4 rounded-lg border border-line bg-white p-5 shadow-[0_2px_8px_rgba(27,31,27,0.05)]">
      <div className="grid gap-1">
        <h2 className="text-2xl leading-snug">Testimony Settings</h2>
        <p className="leading-relaxed text-muted">
          Trainers can be prompted to give a paid testimony (video or text) about their experience
          on the platform. Approved testimonies earn a one-time DL reward and appear in the homepage
          carousel.
        </p>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted">Loading...</p>
      ) : (
        <form className="grid gap-4 md:max-w-md" onSubmit={handleSave}>
          <div>
            <label
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-surface-muted p-4"
              htmlFor="testimony-enabled"
            >
              <input
                checked={enabled}
                className="mt-0.5 size-5 accent-accent"
                id="testimony-enabled"
                onChange={(event) => setEnabled(event.target.checked)}
                type="checkbox"
              />
              <span>
                <span className="block font-bold">Prompt trainers for testimonies</span>
                <span className="mt-1 block text-sm leading-relaxed text-muted">
                  When on, eligible trainers see a dashboard banner inviting them to give a
                  testimony, and the homepage shows the approved-testimony carousel.
                </span>
              </span>
            </label>
          </div>

          <div className="grid gap-1">
            <label className="text-sm font-bold" htmlFor="testimony-max-text">
              Max text testimony length (characters)
            </label>
            <input
              className={`${inputClass} max-w-40`}
              id="testimony-max-text"
              min="1"
              onChange={(e) => setMaxTextLength(e.target.value)}
              step="1"
              type="number"
              value={maxTextLength}
            />
          </div>

          <div className="grid gap-1">
            <label className="text-sm font-bold" htmlFor="testimony-max-video">
              Max video testimony length (seconds)
            </label>
            <input
              className={`${inputClass} max-w-40`}
              id="testimony-max-video"
              min="1"
              onChange={(e) => setMaxVideoSeconds(e.target.value)}
              step="1"
              type="number"
              value={maxVideoSeconds}
            />
          </div>

          <div className="grid gap-1">
            <label className="text-sm font-bold" htmlFor="testimony-reward">
              DL reward on approval
            </label>
            <input
              className={`${inputClass} max-w-40`}
              id="testimony-reward"
              min="0"
              onChange={(e) => setRewardTokens(e.target.value)}
              step="0.01"
              type="number"
              value={rewardTokens}
            />
          </div>

          {error && (
            <p className="leading-relaxed text-danger" role="alert">
              {error}
            </p>
          )}
          {message && <p className="leading-relaxed text-accent-dark">{message}</p>}

          <div>
            <ActionButton
              className={primaryButtonClass}
              pending={isSaving}
              pendingLabel="Saving"
              type="submit"
            >
              Save testimony settings
            </ActionButton>
          </div>
        </form>
      )}
    </section>
  );
}

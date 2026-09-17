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
  const [landingLimit, setLandingLimit] = useState('12');
  const [bubblesEnabled, setBubblesEnabled] = useState(false);
  const [bubbleInterval, setBubbleInterval] = useState('12');
  const [weeklyApprovalLimit, setWeeklyApprovalLimit] = useState('1');
  const [monthlyApprovalLimit, setMonthlyApprovalLimit] = useState('3');
  const [textRewardTokens, setTextRewardTokens] = useState('5');
  const [videoRewardTokens, setVideoRewardTokens] = useState('5');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!settings) return;
    setEnabled(settings.testimonyEnabled);
    setMaxTextLength(String(settings.testimonyMaxTextLength));
    setMaxVideoSeconds(String(settings.testimonyMaxVideoSeconds));
    setLandingLimit(String(settings.testimonyLandingLimit));
    setBubblesEnabled(settings.testimonyBubblesEnabled);
    setBubbleInterval(String(settings.testimonyBubbleIntervalSeconds));
    setWeeklyApprovalLimit(String(settings.testimonyApprovalWeeklyLimit));
    setMonthlyApprovalLimit(String(settings.testimonyApprovalMonthlyLimit));
    setTextRewardTokens(settings.testimonyTextRewardTokens);
    setVideoRewardTokens(settings.testimonyVideoRewardTokens);
  }, [settings]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setError(null);

    const textLength = Number(maxTextLength);
    const videoSeconds = Number(maxVideoSeconds);
    const landingCount = Number(landingLimit);
    const textReward = Number(textRewardTokens);
    const videoReward = Number(videoRewardTokens);
    const weeklyLimit = Number(weeklyApprovalLimit);
    const monthlyLimit = Number(monthlyApprovalLimit);
    if (!Number.isFinite(textLength) || textLength < 1) {
      setError('Max text length must be a positive number.');
      return;
    }
    if (!Number.isFinite(videoSeconds) || videoSeconds < 1) {
      setError('Max video seconds must be a positive number.');
      return;
    }
    if (!Number.isInteger(landingCount) || landingCount < 1 || landingCount > 100) {
      setError('Landing testimony count must be a whole number between 1 and 100.');
      return;
    }
    if (!Number.isFinite(textReward) || textReward < 0) {
      setError('Text testimony reward must be zero or a positive number.');
      return;
    }
    if (!Number.isFinite(videoReward) || videoReward < 0) {
      setError('Video testimony reward must be zero or a positive number.');
      return;
    }
    if (!Number.isInteger(weeklyLimit) || weeklyLimit < 0) {
      setError('Weekly approval limit must be a whole number of zero or more.');
      return;
    }
    if (!Number.isInteger(monthlyLimit) || monthlyLimit < 0) {
      setError('Monthly approval limit must be a whole number of zero or more.');
      return;
    }

    const bubbleSeconds = Number(bubbleInterval);
    if (!Number.isInteger(bubbleSeconds) || bubbleSeconds < 3 || bubbleSeconds > 120) {
      setError('Bubble interval must be a whole number of seconds between 3 and 120.');
      return;
    }

    try {
      await updateSettings({
        testimonyEnabled: enabled,
        testimonyMaxTextLength: textLength,
        testimonyMaxVideoSeconds: videoSeconds,
        testimonyLandingLimit: landingCount,
        testimonyBubblesEnabled: bubblesEnabled,
        testimonyBubbleIntervalSeconds: bubbleSeconds,
        testimonyTextRewardTokens: textReward,
        testimonyVideoRewardTokens: videoReward,
        testimonyApprovalWeeklyLimit: weeklyLimit,
        testimonyApprovalMonthlyLimit: monthlyLimit,
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
            <label className="text-sm font-bold" htmlFor="testimony-weekly-approval-limit">
              Max approvals per trainer in 7 days
            </label>
            <input
              className={`${inputClass} max-w-40`}
              id="testimony-weekly-approval-limit"
              min="0"
              onChange={(e) => setWeeklyApprovalLimit(e.target.value)}
              step="1"
              type="number"
              value={weeklyApprovalLimit}
            />
            <p className="text-xs leading-relaxed text-muted">
              Use 0 to disable this approval gate.
            </p>
          </div>

          <div className="grid gap-1">
            <label className="text-sm font-bold" htmlFor="testimony-monthly-approval-limit">
              Max approvals per trainer in 30 days
            </label>
            <input
              className={`${inputClass} max-w-40`}
              id="testimony-monthly-approval-limit"
              min="0"
              onChange={(e) => setMonthlyApprovalLimit(e.target.value)}
              step="1"
              type="number"
              value={monthlyApprovalLimit}
            />
            <p className="text-xs leading-relaxed text-muted">
              Use 0 to disable this approval gate.
            </p>
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
            <label className="text-sm font-bold" htmlFor="testimony-landing-limit">
              Testimonials shown on the landing page
            </label>
            <input
              className={`${inputClass} max-w-40`}
              id="testimony-landing-limit"
              max="100"
              min="1"
              onChange={(e) => setLandingLimit(e.target.value)}
              step="1"
              type="number"
              value={landingLimit}
            />
            <p className="text-xs leading-relaxed text-muted">
              The public testimonials archive remains available separately.
            </p>
          </div>

          <div className="grid gap-1">
            <label
              className="flex cursor-pointer items-start gap-3"
              htmlFor="testimony-bubbles-enabled"
            >
              <input
                checked={bubblesEnabled}
                className="mt-0.5 size-5 accent-accent"
                id="testimony-bubbles-enabled"
                onChange={(event) => setBubblesEnabled(event.target.checked)}
                type="checkbox"
              />
              <span>
                <span className="block font-bold">Float testimonials up the landing page</span>
                <span className="mt-1 block text-sm leading-relaxed text-muted">
                  Shows one short quote at a time drifting up from the bottom of the landing page,
                  dissolving near the top. Uses the same approved testimonials as the carousel, so
                  it needs the setting above to be on as well. Visitors who ask for reduced motion
                  never see it.
                </span>
              </span>
            </label>
          </div>

          <div className="grid gap-1">
            <label className="text-sm font-bold" htmlFor="testimony-bubble-interval">
              Seconds between floating testimonials
            </label>
            <input
              className={`${inputClass} max-w-40`}
              disabled={!bubblesEnabled}
              id="testimony-bubble-interval"
              max="120"
              min="3"
              onChange={(e) => setBubbleInterval(e.target.value)}
              step="1"
              type="number"
              value={bubbleInterval}
            />
            <p className="text-xs leading-relaxed text-muted">
              Measured from one quote fading out to the next appearing, so a larger number means a
              calmer page. Between 3 and 120 seconds.
            </p>
          </div>

          <div className="grid gap-1">
            <label className="text-sm font-bold" htmlFor="testimony-text-reward">
              Text testimony DL reward on approval
            </label>
            <input
              className={`${inputClass} max-w-40`}
              id="testimony-text-reward"
              min="0"
              onChange={(e) => setTextRewardTokens(e.target.value)}
              step="0.01"
              type="number"
              value={textRewardTokens}
            />
          </div>

          <div className="grid gap-1">
            <label className="text-sm font-bold" htmlFor="testimony-video-reward">
              Video testimony DL reward on approval
            </label>
            <input
              className={`${inputClass} max-w-40`}
              id="testimony-video-reward"
              min="0"
              onChange={(e) => setVideoRewardTokens(e.target.value)}
              step="0.01"
              type="number"
              value={videoRewardTokens}
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

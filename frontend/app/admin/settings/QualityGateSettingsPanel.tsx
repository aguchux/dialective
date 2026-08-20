'use client';

import { useEffect, useState } from 'react';
import { normalizeErrorMessage, useGetPlatformSettingsQuery, useUpdatePlatformSettingsMutation } from '@/store/api';
import { ActionButton } from '@/components/ui/ActionButton';

const inputClass = 'min-h-10 w-full rounded-lg border border-line bg-white px-3 py-2.5 text-ink dark:bg-surface-muted';
const primaryButtonClass =
  'inline-flex min-h-10 items-center justify-center rounded-lg border border-accent bg-accent px-3.5 py-2.5 font-bold text-white transition-colors hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60';

export function QualityGateSettingsPanel() {
  const { data: settings, isLoading } = useGetPlatformSettingsQuery();
  const [updateSettings, { isLoading: isSaving }] = useUpdatePlatformSettingsMutation();

  const [enabled, setEnabled] = useState(false);
  const [weightConsensus, setWeightConsensus] = useState('60');
  const [weightNoise, setWeightNoise] = useState('15');
  const [weightQuality, setWeightQuality] = useState('10');
  const [weightLiveness, setWeightLiveness] = useState('15');
  const [weightAsrMatch, setWeightAsrMatch] = useState('0');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!settings) return;
    setEnabled(settings.qualityGateEnabled);
    setWeightConsensus(settings.qualityWeightConsensus);
    setWeightNoise(settings.qualityWeightNoise);
    setWeightQuality(settings.qualityWeightQuality);
    setWeightLiveness(settings.qualityWeightLiveness);
    setWeightAsrMatch(settings.qualityWeightAsrMatch);
  }, [settings]);

  const weightSum =
    (Number(weightConsensus) || 0) + (Number(weightNoise) || 0) + (Number(weightQuality) || 0) + (Number(weightLiveness) || 0);
  const weightSumValid = Math.abs(weightSum - 100) < 0.01;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setError(null);

    if (!weightSumValid) {
      setError(`Weights must sum to 100% (currently ${weightSum}%).`);
      return;
    }

    try {
      await updateSettings({
        qualityGateEnabled: enabled,
        qualityWeightConsensus: Number(weightConsensus),
        qualityWeightNoise: Number(weightNoise),
        qualityWeightQuality: Number(weightQuality),
        qualityWeightLiveness: Number(weightLiveness),
        qualityWeightAsrMatch: Number(weightAsrMatch),
      }).unwrap();
      setMessage('Quality gate settings saved.');
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to save quality gate settings.'));
    }
  }

  return (
    <section className="grid gap-4 rounded-lg border border-line bg-white p-5 shadow-[0_2px_8px_rgba(27,31,27,0.05)]">
      <div className="grid gap-1">
        <h2 className="text-2xl leading-snug">Voice Quality Gate</h2>
        <p className="leading-relaxed text-muted">
          Every submitted recording is scored for background noise, audio clarity, and live-voice confidence
          (quality-gate-worker). These blend with the transcript/exact-match score into a composite score that drives
          payout -- the composite is always clamped into the Min/Max score range set in General settings, so it
          behaves exactly like the no-fail-on-train synthetic score range, just computed from real signals instead of
          a random draw.
        </p>
      </div>

      {isLoading && <p className="text-muted">Loading...</p>}
      {!isLoading && (
        <form className="grid gap-4 md:max-w-md" onSubmit={handleSave}>
          <div>
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-surface-muted p-4" htmlFor="quality-gate-enabled">
              <input
                checked={enabled}
                className="mt-0.5 size-5 accent-accent"
                id="quality-gate-enabled"
                onChange={(event) => setEnabled(event.target.checked)}
                type="checkbox"
              />
              <span>
                <span className="block font-bold">Apply quality scores to payout</span>
                <span className="mt-1 block text-sm leading-relaxed text-muted">
                  When on, the composite score (below) determines the payout bonus instead of the raw transcript/
                  exact-match score. When off, noise/quality/liveness are still measured and shown for every
                  submission, they just don't affect payout yet -- useful for reviewing scores before turning this on.
                </span>
              </span>
            </label>
          </div>

          <div className="grid gap-2">
            <span className="font-bold">Composite score weights</span>
            <p className="text-sm leading-relaxed text-muted">
              How much each signal counts toward the composite score. Must sum to 100%.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1">
                <label className="text-sm font-bold" htmlFor="weight-consensus">
                  Transcript / exact-match
                </label>
                <input
                  className={inputClass}
                  id="weight-consensus"
                  type="number"
                  step="1"
                  min="0"
                  max="100"
                  value={weightConsensus}
                  onChange={(e) => setWeightConsensus(e.target.value)}
                />
              </div>
              <div className="grid gap-1">
                <label className="text-sm font-bold" htmlFor="weight-noise">
                  Background noise
                </label>
                <input
                  className={inputClass}
                  id="weight-noise"
                  type="number"
                  step="1"
                  min="0"
                  max="100"
                  value={weightNoise}
                  onChange={(e) => setWeightNoise(e.target.value)}
                />
              </div>
              <div className="grid gap-1">
                <label className="text-sm font-bold" htmlFor="weight-quality">
                  Audio quality
                </label>
                <input
                  className={inputClass}
                  id="weight-quality"
                  type="number"
                  step="1"
                  min="0"
                  max="100"
                  value={weightQuality}
                  onChange={(e) => setWeightQuality(e.target.value)}
                />
              </div>
              <div className="grid gap-1">
                <label className="text-sm font-bold" htmlFor="weight-liveness">
                  Voice liveness
                </label>
                <input
                  className={inputClass}
                  id="weight-liveness"
                  type="number"
                  step="1"
                  min="0"
                  max="100"
                  value={weightLiveness}
                  onChange={(e) => setWeightLiveness(e.target.value)}
                />
              </div>
            </div>
            <p className={`text-sm font-bold ${weightSumValid ? 'text-accent-dark' : 'text-danger'}`}>
              Sums to: {weightSum}% {weightSumValid ? '' : '(must equal 100%)'}
            </p>
          </div>

          <div className="grid gap-1">
            <label className="font-bold" htmlFor="weight-asr-match">
              Spoken/typed match (word training only)
            </label>
            <p className="text-sm leading-relaxed text-muted">
              How closely a word-training recording&rsquo;s spoken audio (ASR-transcribed) matches what the trainer
              typed, catching a correct typed answer paired with a different spoken word. Separate from the weights
              above &mdash; it&rsquo;s additive, not part of that 100% budget, and defaults to 0 (off) so this never
              affects payout until you raise it. Doesn&rsquo;t apply to sentence submissions, which already use the
              transcript as their primary score.
            </p>
            <input
              className={`${inputClass} max-w-40`}
              id="weight-asr-match"
              type="number"
              step="1"
              min="0"
              max="100"
              value={weightAsrMatch}
              onChange={(e) => setWeightAsrMatch(e.target.value)}
            />
          </div>

          <div>
            <ActionButton className={primaryButtonClass} disabled={!weightSumValid} type="submit" pending={isSaving} pendingLabel="Saving">
              Save quality gate settings
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

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

export function TrainingTasksSettingsPanel() {
  const [recordingTimeoutSeconds, setRecordingTimeoutSeconds] = useState('5');
  const [recordingMaxTimeoutSeconds, setRecordingMaxTimeoutSeconds] = useState('180');
  const [auditHoldEveryN, setAuditHoldEveryN] = useState('500');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: platformSettings, isLoading: isLoadingPlatformSettings } =
    useGetPlatformSettingsQuery();
  const [updatePlatformSettings, { isLoading: isSaving }] = useUpdatePlatformSettingsMutation();

  useEffect(() => {
    if (!platformSettings) return;
    setRecordingTimeoutSeconds(String(platformSettings.wordTrainingRecordingTimeoutSeconds));
    setRecordingMaxTimeoutSeconds(String(platformSettings.wordTrainingRecordingMaxTimeoutSeconds));
    setAuditHoldEveryN(String(platformSettings.auditHoldEveryNSubmissions));
  }, [platformSettings]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setError(null);

    try {
      await updatePlatformSettings({
        wordTrainingRecordingTimeoutSeconds: Number(recordingTimeoutSeconds),
        wordTrainingRecordingMaxTimeoutSeconds: Number(recordingMaxTimeoutSeconds),
        auditHoldEveryNSubmissions: Number(auditHoldEveryN),
      }).unwrap();
      setMessage('Training & tasks settings saved.');
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to save training & tasks settings.'));
    }
  }

  return (
    <section className="grid gap-4 rounded-lg border border-line bg-white p-5 shadow-[0_2px_8px_rgba(27,31,27,0.05)]">
      <div className="grid gap-1">
        <h2 className="text-2xl leading-snug">Training & tasks</h2>
        <p className="leading-relaxed text-muted">
          Controls for the live voice-recording round in the trainer dashboard.
        </p>
      </div>

      {isLoadingPlatformSettings && <p className="text-muted">Loading...</p>}
      {!isLoadingPlatformSettings && (
        <form className="grid gap-4 md:max-w-xl" onSubmit={handleSave}>
          <div className="grid gap-2 rounded-lg border border-line bg-surface p-4">
            <p className="font-bold">Live recording timeout</p>
            <p className="leading-relaxed text-muted">
              Controls previously hardcoded in frontend/backend constants and deployment env vars.
            </p>

            <label htmlFor="recording-timeout-seconds">
              Live recording timeout, per word (seconds)
            </label>
            <p className="text-sm leading-relaxed text-muted">
              Multiplied by the number of words in the assignment -- a 5-word sentence gets 5x this
              value, up to the cap below.
            </p>
            <input
              className={inputClass}
              id="recording-timeout-seconds"
              type="number"
              step="1"
              min="1"
              max="120"
              value={recordingTimeoutSeconds}
              onChange={(e) => setRecordingTimeoutSeconds(e.target.value)}
              required
            />

            <label htmlFor="recording-max-timeout-seconds">
              Live recording timeout cap, total (seconds)
            </label>
            <input
              className={inputClass}
              id="recording-max-timeout-seconds"
              type="number"
              step="1"
              min="5"
              max="1800"
              value={recordingMaxTimeoutSeconds}
              onChange={(e) => setRecordingMaxTimeoutSeconds(e.target.value)}
              required
            />
          </div>

          <div className="grid gap-2 rounded-lg border border-line bg-surface p-4">
            <p className="font-bold">Automatic audit hold</p>
            <p className="leading-relaxed text-muted">
              A trainer&rsquo;s account is automatically put on hold for review every time their
              lifetime word recording count reaches a multiple of this number, blocking new training
              tasks until an admin releases the hold (Users &rarr; a trainer&rsquo;s page &rarr;
              Audit hold). This is separate from suspending or blocking an account. Set to 0 to turn
              the feature off.
            </p>

            <label htmlFor="audit-hold-every-n">Put on hold every N submissions</label>
            <input
              className={`${inputClass} max-w-40`}
              id="audit-hold-every-n"
              type="number"
              step="1"
              min="0"
              value={auditHoldEveryN}
              onChange={(e) => setAuditHoldEveryN(e.target.value)}
              required
            />
          </div>

          <div>
            <ActionButton
              className={primaryButtonClass}
              type="submit"
              pending={isSaving}
              pendingLabel="Saving"
            >
              Save settings
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

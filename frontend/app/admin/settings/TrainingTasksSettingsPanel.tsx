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
  const [submissionRateLimitEnabled, setSubmissionRateLimitEnabled] = useState(false);
  const [submissionRateLimitPerHour, setSubmissionRateLimitPerHour] = useState('120');
  const [submissionDailyLimitEnabled, setSubmissionDailyLimitEnabled] = useState(false);
  const [submissionDailyLimitPerDay, setSubmissionDailyLimitPerDay] = useState('200');
  const [wordTrainingEnabled, setWordTrainingEnabled] = useState(true);
  const [sentenceTrainingEnabled, setSentenceTrainingEnabled] = useState(true);
  const [reverseWordTrainingEnabled, setReverseWordTrainingEnabled] = useState(false);
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
    setSubmissionRateLimitEnabled(platformSettings.submissionRateLimitEnabled);
    setSubmissionRateLimitPerHour(String(platformSettings.submissionRateLimitPerHour));
    setSubmissionDailyLimitEnabled(platformSettings.submissionDailyLimitEnabled);
    setSubmissionDailyLimitPerDay(String(platformSettings.submissionDailyLimitPerDay));
    setWordTrainingEnabled(platformSettings.wordTrainingEnabled);
    setSentenceTrainingEnabled(platformSettings.sentenceTrainingEnabled);
    setReverseWordTrainingEnabled(platformSettings.reverseWordTrainingEnabled);
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
        submissionRateLimitEnabled,
        submissionRateLimitPerHour: Number(submissionRateLimitPerHour),
        submissionDailyLimitEnabled,
        submissionDailyLimitPerDay: Number(submissionDailyLimitPerDay),
        wordTrainingEnabled,
        sentenceTrainingEnabled,
        reverseWordTrainingEnabled,
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
          <div className="grid gap-3 rounded-lg border border-line p-4">
            <div>
              <p className="font-black">Content sources</p>
              <p className="mt-1 text-sm leading-relaxed text-muted">
                Controls what trainers are shown when they open a training session. All three can be
                turned off at once -- when Word and Sentence training are both off, trainers are
                shown reverse-validation (Dialect-to-English) exclusively instead of an error, as
                long as it stays on. Only when all three are off does a trainer see a "nothing
                available" screen.
              </p>
            </div>

            <label
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-surface-muted p-4"
              htmlFor="word-training-enabled"
            >
              <input
                checked={wordTrainingEnabled}
                className="mt-0.5 size-5 accent-accent"
                id="word-training-enabled"
                onChange={(event) => setWordTrainingEnabled(event.target.checked)}
                type="checkbox"
              />
              <span>
                <span className="block font-bold">Enable single words</span>
                <span className="mt-1 block text-sm leading-relaxed text-muted">
                  Trainers are shown single English words from the Word bank to translate and record
                  in their dialect (English &rarr; Dialect). Turn this off to stop single-word
                  assignments entirely.
                </span>
              </span>
            </label>

            <label
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-surface-muted p-4"
              htmlFor="sentence-training-enabled"
            >
              <input
                checked={sentenceTrainingEnabled}
                className="mt-0.5 size-5 accent-accent"
                id="sentence-training-enabled"
                onChange={(event) => setSentenceTrainingEnabled(event.target.checked)}
                type="checkbox"
              />
              <span>
                <span className="block font-bold">Enable sentences</span>
                <span className="mt-1 block text-sm leading-relaxed text-muted">
                  Trainers are shown English sentences from the Sentence bank to translate and
                  record in their dialect (English &rarr; Dialect). Turn this off to stop sentence
                  assignments entirely.
                </span>
              </span>
            </label>

            <label
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-surface-muted p-4"
              htmlFor="reverse-word-training"
            >
              <input
                checked={reverseWordTrainingEnabled}
                className="mt-0.5 size-5 accent-accent"
                id="reverse-word-training"
                onChange={(event) => setReverseWordTrainingEnabled(event.target.checked)}
                type="checkbox"
              />
              <span>
                <span className="block font-bold">Enable Dialect-to-English validation</span>
                <span className="mt-1 block text-sm leading-relaxed text-muted">
                  Trainers listen to another trainer&apos;s dialect recording, write the English
                  they hear, and record their own fresh dialect take of it for reverse-consensus
                  validation. Independent of Word/Sentence training above -- and the only source
                  left once both are off.
                </span>
              </span>
            </label>

            {!wordTrainingEnabled && !sentenceTrainingEnabled && !reverseWordTrainingEnabled && (
              <p className="rounded-lg bg-[#fee8ef] px-3 py-2 text-sm font-bold text-[#D9366A]">
                All three content sources are off -- trainers will see a &quot;nothing
                available&quot; screen with no way to train until at least one is turned back on.
              </p>
            )}
          </div>

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

          <div className="grid gap-3 rounded-lg border border-line bg-surface p-4">
            <p className="font-bold">Submission rate limiting</p>
            <p className="leading-relaxed text-muted">
              Caps how many sentence/dictation and word recordings a single trainer can submit per
              rolling hour, protecting the ASR and quality-gate workers from being overwhelmed by a
              runaway or scripted client. Off by default.
            </p>

            <label
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-surface-muted p-4"
              htmlFor="submission-rate-limit-enabled"
            >
              <input
                checked={submissionRateLimitEnabled}
                className="mt-0.5 size-5 accent-accent"
                id="submission-rate-limit-enabled"
                onChange={(event) => setSubmissionRateLimitEnabled(event.target.checked)}
                type="checkbox"
              />
              <span>
                <span className="block font-bold">Enable submission rate limiting</span>
                <span className="mt-1 block text-sm leading-relaxed text-muted">
                  When on, a trainer exceeding the limit below gets a "too many requests" response
                  until the rolling hour window resets.
                </span>
              </span>
            </label>

            <label htmlFor="submission-rate-limit-per-hour">
              Max submissions per trainer per hour
            </label>
            <input
              className={`${inputClass} max-w-40`}
              id="submission-rate-limit-per-hour"
              type="number"
              step="1"
              min="1"
              max="100000"
              value={submissionRateLimitPerHour}
              onChange={(e) => setSubmissionRateLimitPerHour(e.target.value)}
              required
            />

            <label
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-surface-muted p-4"
              htmlFor="submission-daily-limit-enabled"
            >
              <input
                checked={submissionDailyLimitEnabled}
                className="mt-0.5 size-5 accent-accent"
                id="submission-daily-limit-enabled"
                onChange={(event) => setSubmissionDailyLimitEnabled(event.target.checked)}
                type="checkbox"
              />
              <span>
                <span className="block font-bold">Enable daily submission cap</span>
                <span className="mt-1 block text-sm leading-relaxed text-muted">
                  Independent of the hourly limit above -- you can run either, both, or neither.
                  The hourly limit stops a burst; this one caps a whole day, which is what governs
                  how fast DL is minted. Enforced at tasking: a trainer who has spent their
                  allowance stops being given new words, rather than recording first and being
                  refused on submit. Counted over a rolling 24 hours from actual recordings, so it
                  survives a restart and cannot be reset at midnight.
                </span>
              </span>
            </label>

            <label htmlFor="submission-daily-limit-per-day">
              Max submissions per trainer per day
            </label>
            <input
              className={`${inputClass} max-w-40`}
              id="submission-daily-limit-per-day"
              type="number"
              step="1"
              min="1"
              max="100000"
              value={submissionDailyLimitPerDay}
              onChange={(e) => setSubmissionDailyLimitPerDay(e.target.value)}
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

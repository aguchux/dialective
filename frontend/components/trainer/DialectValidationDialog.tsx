'use client';

import * as RadixDialog from '@radix-ui/react-dialog';
import { ArrowRight, Check, Clock3, LoaderCircle, Pause, Play, Send, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { usePortalContainer } from '@/components/ui/PortalContainer';
import { notifyFullScreenOverlay } from '@/lib/recording-signal';
import { QracDialog } from '@/components/trainer/QracDialog';
import {
  ApiErrorShape,
  WordValidationFlag,
  WordValidationItem,
  normalizeErrorMessage,
  useEndWordTrainingSessionMutation,
  useLazyGetNextWordValidationItemQuery,
  useStartWordTrainingSessionMutation,
  useSubmitWordValidationMutation,
} from '@/store/api';

const FLAG_OPTIONS: { value: WordValidationFlag; label: string }[] = [
  { value: 'WRONG_DIALECT', label: 'Wrong dialect / recorded in another dialect' },
  { value: 'NO_AUDIO', label: 'No audio / silent or unusable' },
  { value: 'UNCLEAR_NOISY', label: 'Unclear / too noisy to judge' },
  { value: 'MULTIPLE_SPEAKERS', label: 'Multiple speakers / background voices' },
  { value: 'TOO_FAST', label: 'Spoken too fast' },
  { value: 'TOO_SLOW', label: 'Spoken too slow' },
];

// Sentinel id (never a real Word.id, which are UUIDs) for the "None of the
// above" radio choice appended to item.wordOptions -- picking it maps to
// the NO_WORD_MATCH flag on submit instead of a selectedWordId, reusing
// the flag's existing server-side semantics rather than adding a new one.
// Kept as a fixed LAST option (not shuffled in with the real word choices)
// since it's a distinct "none of these" escape hatch, not a candidate
// answer itself.
const NONE_OF_THE_ABOVE_ID = '__none_of_the_above__';

function extractQracRequired(err: unknown): boolean {
  const data = (err as { data?: ApiErrorShape } | undefined)?.data;
  return !!data?.qracRequired;
}

function isNoItemsAvailable(err: unknown): boolean {
  const message = (err as { data?: ApiErrorShape } | undefined)?.data?.message;
  const text = Array.isArray(message) ? message.join(' ') : message;
  return text === 'NO_VALIDATION_ITEMS_AVAILABLE';
}

function extractRequiredCourses(
  err: unknown,
): { id: string; slug: string; title: string }[] | null {
  const data = (err as { data?: ApiErrorShape } | undefined)?.data;
  return data?.requiredCourses && data.requiredCourses.length > 0 ? data.requiredCourses : null;
}

type FlowStep = 'terms' | 'loading' | 'validating' | 'unavailable';

/**
 * "Dialect Validation" task -- sibling to WordTrainingDialog/
 * DomainConversationDialog. A trainer listens to a PEER's word recording
 * (never their own, always their own dialect -- see WordValidationService.
 * pickCandidate) and either picks the English word they heard from a
 * multiple-choice list and/or ticks problem flags. No audio is produced by
 * this task (no MediaRecorder/upload lifecycle, unlike the other two), no
 * token cost -- an optional flat reward is credited on submit instead (see
 * rewarded/rewardAmount in the submit response).
 */
export function DialectValidationDialog({
  open,
  onOpenChange,
  onRequiredCourses,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRequiredCourses?: (courses: { id: string; slug: string; title: string }[]) => void;
}) {
  const portalContainer = usePortalContainer();
  const [step, setStep] = useState<FlowStep>('terms');
  const [accepted, setAccepted] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [item, setItem] = useState<WordValidationItem | null>(null);
  const [selectedWordId, setSelectedWordId] = useState<string | null>(null);
  const [flags, setFlags] = useState<WordValidationFlag[]>([]);
  const [transcript, setTranscript] = useState('');
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qracOpen, setQracOpen] = useState(false);
  const [submitted, setSubmitted] = useState<{ rewarded: boolean; rewardAmount: string | null } | null>(
    null,
  );

  const [startSession, { isLoading: isStarting }] = useStartWordTrainingSessionMutation();
  const [loadNext, { isFetching: isLoadingNext }] = useLazyGetNextWordValidationItemQuery();
  const [endSession] = useEndWordTrainingSessionMutation();
  const [submitValidation, { isLoading: isSubmitting }] = useSubmitWordValidationMutation();

  useEffect(() => {
    notifyFullScreenOverlay(open);
    return () => notifyFullScreenOverlay(false);
  }, [open]);

  useEffect(() => {
    if (open) return;
    setStep('terms');
    setAccepted(false);
    setItem(null);
    resetAnswer();
    setError(null);
    setQracOpen(false);
    setSubmitted(null);
  }, [open]);

  function resetAnswer() {
    setSelectedWordId(null);
    setFlags([]);
    setTranscript('');
    setPlaying(false);
  }

  function toggleFlag(flag: WordValidationFlag) {
    setFlags((current) =>
      current.includes(flag) ? current.filter((f) => f !== flag) : [...current, flag],
    );
  }

  async function closeDialog() {
    if (sessionId) void endSession(sessionId);
    setSessionId(null);
    onOpenChange(false);
  }

  async function beginSession() {
    if (!accepted) return;
    setError(null);
    setStep('loading');
    try {
      const created = await startSession({ acceptedVoiceTerms: true }).unwrap();
      setSessionId(created.sessionId);
      try {
        const next = await loadNext(created.sessionId, false).unwrap();
        setItem(next);
        setStep('validating');
      } catch (err) {
        if (extractQracRequired(err)) {
          setQracOpen(true);
          return;
        }
        void endSession(created.sessionId);
        setSessionId(null);
        if (isNoItemsAvailable(err)) {
          setStep('unavailable');
          return;
        }
        throw err;
      }
    } catch (err) {
      const requiredCourses = extractRequiredCourses(err);
      if (requiredCourses && onRequiredCourses) {
        onOpenChange(false);
        onRequiredCourses(requiredCourses);
        return;
      }
      setError(normalizeErrorMessage(err, 'Unable to start a validation session.'));
      setStep('terms');
    }
  }

  async function nextItem() {
    if (!sessionId) return;
    setError(null);
    resetAnswer();
    setSubmitted(null);
    setItem(null);
    try {
      setItem(await loadNext(sessionId, false).unwrap());
      setStep('validating');
    } catch (err) {
      if (isNoItemsAvailable(err)) {
        setStep('unavailable');
        return;
      }
      if (extractQracRequired(err)) {
        setQracOpen(true);
        return;
      }
      const requiredCourses = extractRequiredCourses(err);
      if (requiredCourses && onRequiredCourses) {
        void endSession(sessionId);
        setSessionId(null);
        onOpenChange(false);
        onRequiredCourses(requiredCourses);
        return;
      }
      setError(normalizeErrorMessage(err, 'Unable to load the next recording.'));
    }
  }

  async function handleQracSigned() {
    setQracOpen(false);
    void nextItem();
  }

  async function handleQracEndSession() {
    setQracOpen(false);
    void closeDialog();
  }

  async function submitAnswer() {
    if (!item) return;
    setError(null);
    try {
      const noneOfTheAbove = selectedWordId === NONE_OF_THE_ABOVE_ID;
      const submittedFlags = noneOfTheAbove
        ? Array.from(new Set([...flags, 'NO_WORD_MATCH' as WordValidationFlag]))
        : flags;
      const result = await submitValidation({
        recordingId: item.recordingId,
        presentmentToken: item.presentmentToken,
        selectedWordId: noneOfTheAbove ? undefined : (selectedWordId ?? undefined),
        transcript: transcript.trim() || undefined,
        flags: submittedFlags.length > 0 ? submittedFlags : undefined,
      }).unwrap();
      setSubmitted({ rewarded: result.rewarded, rewardAmount: result.rewardAmount });
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to submit this validation.'));
    }
  }

  const canSubmit = !!selectedWordId || flags.length > 0;

  return (
    <>
      <RadixDialog.Root open={open} onOpenChange={(nextOpen) => { if (!nextOpen) void closeDialog(); }}>
        <RadixDialog.Portal container={portalContainer}>
          <RadixDialog.Overlay className="fixed inset-0 z-40 bg-black/65 data-[state=open]:animate-[fadeIn_150ms_ease-out]" />
          <RadixDialog.Content
            aria-describedby="dialect-validation-description"
            className="fixed inset-0 z-50 overflow-y-auto bg-bg text-ink focus:outline-none data-[state=open]:animate-[fadeIn_150ms_ease-out]"
            onOpenAutoFocus={(event) => event.preventDefault()}
          >
            <header className="sticky top-0 z-10 border-b border-line bg-surface/95 backdrop-blur">
              <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-4 md:px-6">
                <div className="min-w-0">
                  <RadixDialog.Title className="truncate text-lg font-black">
                    Dialect Validation
                  </RadixDialog.Title>
                  <RadixDialog.Description
                    className="truncate text-xs font-semibold text-muted"
                    id="dialect-validation-description"
                  >
                    Listening review session
                  </RadixDialog.Description>
                </div>
                <button
                  aria-label="Close validation"
                  className="grid size-10 place-items-center rounded-lg border border-line bg-surface hover:bg-surface-muted"
                  onClick={() => void closeDialog()}
                  type="button"
                >
                  <X className="size-5" aria-hidden="true" />
                </button>
              </div>
            </header>

            <main className="mx-auto grid min-h-[calc(100dvh-4rem)] w-full max-w-5xl content-center px-4 py-8 md:px-6">
              {step === 'terms' && (
                <section className="mx-auto grid w-full max-w-2xl gap-6 rounded-lg border border-line bg-surface p-5 md:p-7">
                  <div>
                    <p className="text-sm font-extrabold text-accent">Peer review</p>
                    <h2 className="mt-1 text-2xl font-black">Help validate your dialect</h2>
                  </div>
                  <div className="grid gap-3 text-sm leading-7 text-muted md:text-base">
                    <p>
                      You&apos;ll listen to short recordings from other trainers in your dialect and
                      confirm which word was said.
                    </p>
                    <p>
                      If a recording is unclear, unusable, or doesn&apos;t sound like your dialect at
                      all, tick the matching flag instead -- this helps keep the library accurate.
                    </p>
                  </div>
                  <label
                    className="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-surface-muted p-4"
                    htmlFor="dialect-validation-consent"
                  >
                    <input
                      checked={accepted}
                      className="mt-0.5 size-5 accent-accent"
                      id="dialect-validation-consent"
                      onChange={(event) => setAccepted(event.target.checked)}
                      type="checkbox"
                    />
                    <span className="text-sm font-bold leading-6">
                      I understand this task reviews other trainers&apos; recordings and my
                      responses may be used to keep dialect data accurate.
                    </span>
                  </label>
                  {error && (
                    <p className="text-sm font-bold text-danger" role="alert">
                      {error}
                    </p>
                  )}
                  <button
                    className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-accent px-5 font-extrabold text-white hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-45"
                    disabled={!accepted || isStarting}
                    onClick={() => void beginSession()}
                    type="button"
                  >
                    {isStarting ? (
                      <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
                    ) : (
                      <Check className="size-5" aria-hidden="true" />
                    )}
                    Start validating
                  </button>
                </section>
              )}

              {step === 'loading' && (
                <div className="mx-auto grid place-items-center gap-3 text-center">
                  <LoaderCircle className="size-8 animate-spin text-accent" aria-hidden="true" />
                  <p className="font-bold text-muted">Preparing your session...</p>
                </div>
              )}

              {step === 'validating' && (
                <section className="mx-auto grid w-full max-w-2xl gap-6">
                  {isLoadingNext || !item ? (
                    <div className="mx-auto grid place-items-center gap-3 text-center">
                      <LoaderCircle className="size-8 animate-spin text-accent" aria-hidden="true" />
                      <p className="font-bold text-muted">Loading the next recording...</p>
                    </div>
                  ) : submitted ? (
                    <div className="mx-auto grid w-full max-w-md gap-4 rounded-lg border border-line bg-surface p-5 text-center">
                      <div className="flex items-center justify-center gap-2 font-black text-emerald-700 dark:text-emerald-300">
                        <Check className="size-5" aria-hidden="true" />
                        Validation submitted
                      </div>
                      {submitted.rewarded && submitted.rewardAmount && (
                        <p className="text-sm font-bold text-muted">
                          +{submitted.rewardAmount} DL credited to your wallet
                        </p>
                      )}
                      <button
                        className="mx-auto inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-accent px-5 font-extrabold text-white hover:bg-accent-dark"
                        onClick={() => void nextItem()}
                        type="button"
                      >
                        Next recording <ArrowRight className="size-4" aria-hidden="true" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="mx-auto grid w-full max-w-md justify-items-center gap-2 text-center">
                        <span className="inline-flex items-center rounded-full bg-accent-soft px-3 py-1 text-xs font-extrabold text-accent">
                          {item.dialectName}
                        </span>
                        <p className="text-sm font-bold text-muted">
                          Listen, then pick the word you heard (or tick a flag below)
                        </p>
                      </div>

                      {item.audioUrl && (
                        <div className="mx-auto flex items-center justify-center">
                          <button
                            aria-label={playing ? 'Pause recording' : 'Play recording'}
                            className="grid size-16 shrink-0 place-items-center rounded-full bg-accent text-white shadow-[0_8px_20px_rgba(126,34,206,0.3)] transition-transform hover:bg-accent-dark active:scale-95"
                            onClick={() => {
                              const audio = document.getElementById(
                                'dialect-validation-audio',
                              ) as HTMLAudioElement | null;
                              if (!audio) return;
                              if (playing) {
                                audio.pause();
                              } else {
                                void audio.play();
                              }
                            }}
                            type="button"
                          >
                            {playing ? (
                              <Pause className="size-6 fill-current" aria-hidden="true" />
                            ) : (
                              <Play className="ml-1 size-6 fill-current" aria-hidden="true" />
                            )}
                          </button>
                          <audio
                            id="dialect-validation-audio"
                            onEnded={() => setPlaying(false)}
                            onPause={() => setPlaying(false)}
                            onPlay={() => setPlaying(true)}
                            src={item.audioUrl}
                          />
                        </div>
                      )}

                      {item.wordOptions.length > 0 && (
                        <div className="mx-auto grid w-full max-w-md gap-2">
                          <p className="text-sm font-extrabold">Which word did you hear?</p>
                          <div className="grid gap-2">
                            {item.wordOptions.map((word) => (
                              <label
                                className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-left font-bold transition-colors ${
                                  selectedWordId === word.id
                                    ? 'border-accent bg-accent-soft'
                                    : 'border-line bg-surface hover:bg-surface-muted'
                                }`}
                                key={word.id}
                              >
                                <input
                                  checked={selectedWordId === word.id}
                                  className="size-4 accent-accent"
                                  name="word-option"
                                  onChange={() => setSelectedWordId(word.id)}
                                  type="radio"
                                />
                                {word.text}
                              </label>
                            ))}
                            <label
                              className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-left font-bold italic transition-colors ${
                                selectedWordId === NONE_OF_THE_ABOVE_ID
                                  ? 'border-accent bg-accent-soft'
                                  : 'border-line bg-surface hover:bg-surface-muted'
                              }`}
                            >
                              <input
                                checked={selectedWordId === NONE_OF_THE_ABOVE_ID}
                                className="size-4 accent-accent"
                                name="word-option"
                                onChange={() => setSelectedWordId(NONE_OF_THE_ABOVE_ID)}
                                type="radio"
                              />
                              None of the above
                            </label>
                          </div>
                        </div>
                      )}

                      <div className="mx-auto grid w-full max-w-md gap-2 text-left">
                        <label className="text-sm font-extrabold" htmlFor="validation-transcript">
                          Transcription (optional)
                        </label>
                        <input
                          className="min-h-11 w-full rounded-lg border border-line bg-surface px-4 text-base font-bold outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft"
                          id="validation-transcript"
                          onChange={(event) => setTranscript(event.target.value)}
                          placeholder="What you heard, if different from the options above"
                          value={transcript}
                        />
                      </div>

                      <div className="mx-auto grid w-full max-w-md gap-2">
                        <p className="text-sm font-extrabold">Anything wrong with this recording?</p>
                        <div className="grid gap-1.5">
                          {FLAG_OPTIONS.map((flag) => (
                            <label
                              className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-line bg-surface px-3 py-2 text-sm font-bold hover:bg-surface-muted"
                              key={flag.value}
                            >
                              <input
                                checked={flags.includes(flag.value)}
                                className="size-4 accent-accent"
                                onChange={() => toggleFlag(flag.value)}
                                type="checkbox"
                              />
                              {flag.label}
                            </label>
                          ))}
                        </div>
                      </div>

                      {error && (
                        <p className="text-center text-sm font-bold text-danger" role="alert">
                          {error}
                        </p>
                      )}

                      <div className="flex items-center justify-center gap-3">
                        <button
                          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-accent px-6 font-extrabold text-white hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-45"
                          disabled={!canSubmit || isSubmitting}
                          onClick={() => void submitAnswer()}
                          type="button"
                        >
                          {isSubmitting ? (
                            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                          ) : (
                            <Send className="size-4" aria-hidden="true" />
                          )}
                          Submit
                        </button>
                      </div>
                    </>
                  )}
                </section>
              )}

              {step === 'unavailable' && (
                <section className="mx-auto grid w-full max-w-md gap-4 text-center">
                  <span className="mx-auto grid size-14 place-items-center rounded-full bg-accent-soft text-accent">
                    <Clock3 className="size-7" aria-hidden="true" />
                  </span>
                  <h2 className="text-2xl font-black">No recordings to validate right now</h2>
                  <p className="leading-relaxed text-muted">
                    You&apos;ve reviewed everything available in your dialect for now. Check back
                    later once more recordings come in.
                  </p>
                  <button
                    className="mx-auto inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line bg-surface px-5 font-extrabold hover:bg-surface-muted"
                    onClick={() => void closeDialog()}
                    type="button"
                  >
                    Close
                  </button>
                </section>
              )}
            </main>
          </RadixDialog.Content>
        </RadixDialog.Portal>
      </RadixDialog.Root>
      <QracDialog
        onEndSession={() => void handleQracEndSession()}
        onSigned={() => void handleQracSigned()}
        open={qracOpen}
        sessionId={sessionId}
      />
    </>
  );
}

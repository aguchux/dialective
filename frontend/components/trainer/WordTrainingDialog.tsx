'use client';

import * as RadixDialog from '@radix-ui/react-dialog';
import * as RadixPopover from '@radix-ui/react-popover';
import {
  ArrowLeft,
  ArrowRight,
  BookOpenCheck,
  Check,
  Clock3,
  Keyboard,
  LoaderCircle,
  Mic,
  Pause,
  Play,
  RotateCcw,
  Send,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActionButton } from '@/components/ui/ActionButton';
import { usePortalContainer } from '@/components/ui/PortalContainer';
import {
  ApiErrorShape,
  RecordingNoiseRating,
  WordTrainingAssignment,
  WordTrainingSession,
  normalizeErrorMessage,
  useCreateWordRecordingUploadMutation,
  useEndWordTrainingSessionMutation,
  useLazyGetNextWordTrainingAssignmentQuery,
  useLazyGetSpellingSuggestionsQuery,
  useStartWordTrainingSessionMutation,
  useSubmitWordRecordingMutation,
} from '@/store/api';

const DEFAULT_SECONDS_PER_WORD = 5;
const DEFAULT_MAX_RECORDING_MS = 180_000;
const RING_RADIUS = 104;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/** Counts words in the assignment's prompt text -- 1-word dictionary entries today, but a general split so a multi-word phrase scales the timeout the same way. */
function countPromptWords(promptText: string | null | undefined): number {
  if (!promptText) return 1;
  const words = promptText.trim().split(/\s+/).filter(Boolean);
  return Math.max(1, words.length);
}

// Distinct, stable messages the backend returns when the word bank is
// empty (see WordsService.nextAssignment's NO_WORDS_AVAILABLE) -- matched
// here to show a "check back later" empty state instead of a generic error
// banner. There is no per-word usage limit; this only ever means the pool
// itself has zero rows right now.
function isNoWordsAvailable(err: unknown): boolean {
  const message = (err as { data?: ApiErrorShape } | undefined)?.data?.message;
  const text = Array.isArray(message) ? message.join(' ') : message;
  return text === 'NO_WORDS_AVAILABLE';
}

type FlowStep = 'select' | 'terms' | 'loading' | 'training' | 'unavailable';
type RecorderState = 'ready' | 'recording' | 'recorded' | 'playing' | 'paused' | 'submitting' | 'submitted';

export function WordTrainingDialog({
  open,
  onOpenChange,
  recordingTimeoutSeconds,
  recordingMaxTimeoutSeconds,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Seconds allowed per word (not a flat round total) -- multiplied by the assignment's word count to get the round's countdown. */
  recordingTimeoutSeconds?: number;
  /** Absolute ceiling on the round's total countdown after the per-word multiplication. */
  recordingMaxTimeoutSeconds?: number;
}) {
  const portalContainer = usePortalContainer();
  const [step, setStep] = useState<FlowStep>('select');
  const [accepted, setAccepted] = useState(false);
  const [session, setSession] = useState<WordTrainingSession | null>(null);
  const [assignment, setAssignment] = useState<WordTrainingAssignment | null>(null);
  const [responseText, setResponseText] = useState('');
  const [recorderState, setRecorderState] = useState<RecorderState>('ready');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [noiseRating, setNoiseRating] = useState<RecordingNoiseRating>('QUIET');
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [score, setScore] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<{ text: string; source: 'community' | 'ai' }[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [pickedIndexes, setPickedIndexes] = useState<number[]>([]);
  const [rebuildSubmitting, setRebuildSubmitting] = useState(false);
  const [rebuildSubmitted, setRebuildSubmitted] = useState(false);
  const [rebuildScore, setRebuildScore] = useState<number | null>(null);
  const [sourcePlaying, setSourcePlaying] = useState(false);

  const [startSession, { isLoading: isStarting }] = useStartWordTrainingSessionMutation();
  const [loadNext, { isFetching: isLoadingNext }] = useLazyGetNextWordTrainingAssignmentQuery();
  const [endSession] = useEndWordTrainingSessionMutation();
  const [createUpload] = useCreateWordRecordingUploadMutation();
  const [submitRecording] = useSubmitWordRecordingMutation();
  const [loadSuggestions] = useLazyGetSpellingSuggestionsQuery();

  // Per-word seconds x word count in the prompt, clamped to the admin's
  // absolute ceiling -- a 5s/word setting gives a 1-word assignment 5s and
  // a 5-word sentence 25s. Falls back to flat defaults if settings haven't
  // loaded yet or the assignment itself hasn't (word count treated as 1).
  const perWordSeconds =
    recordingTimeoutSeconds && Number.isFinite(recordingTimeoutSeconds) && recordingTimeoutSeconds > 0
      ? recordingTimeoutSeconds
      : DEFAULT_SECONDS_PER_WORD;
  const maxTotalSeconds =
    recordingMaxTimeoutSeconds && Number.isFinite(recordingMaxTimeoutSeconds) && recordingMaxTimeoutSeconds > 0
      ? recordingMaxTimeoutSeconds
      : DEFAULT_MAX_RECORDING_MS / 1000;
  const wordCount = countPromptWords(assignment?.promptText);
  const maxRecordingMs = Math.min(perWordSeconds * wordCount, maxTotalSeconds) * 1000;

  const responseInputRef = useRef<HTMLInputElement | null>(null);
  const suggestionsDebounceRef = useRef<number | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const noiseTotalRef = useRef(0);
  const noiseSamplesRef = useRef(0);
  const lastNoiseRenderRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const sourceAudioRef = useRef<HTMLAudioElement | null>(null);

  const releaseMicrophone = useCallback(() => {
    if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current);
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    animationFrameRef.current = null;
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    void audioContextRef.current?.close();
    audioContextRef.current = null;
  }, []);

  const clearRecording = useCallback(() => {
    audioRef.current?.pause();
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioBlob(null);
    setAudioUrl(null);
    setElapsedMs(0);
    setNoiseRating('QUIET');
    setRecorderState('ready');
    setScore(null);
    chunksRef.current = [];
  }, [audioUrl]);

  useEffect(() => () => {
    releaseMicrophone();
    if (audioUrl) URL.revokeObjectURL(audioUrl);
  }, [audioUrl, releaseMicrophone]);

  useEffect(() => {
    if (open) return;
    releaseMicrophone();
    clearRecording();
    setStep('select');
    setAccepted(false);
    setAssignment(null);
    setResponseText('');
    setError(null);
    setSuggestions([]);
    setSuggestionsOpen(false);
    setKeyboardOpen(false);
    setPickedIndexes([]);
    setRebuildSubmitting(false);
    setRebuildSubmitted(false);
    setRebuildScore(null);
    setSourcePlaying(false);
  }, [clearRecording, open, releaseMicrophone]);

  useEffect(() => {
    if (!assignment || assignment.direction !== 'ENGLISH_TO_DIALECT' || !assignment.dialectTag || !assignment.wordId) {
      setSuggestions([]);
      return;
    }
    const wordId = assignment.wordId;
    const dialectTag = assignment.dialectTag;
    const query = responseText.trim();
    if (suggestionsDebounceRef.current !== null) window.clearTimeout(suggestionsDebounceRef.current);
    suggestionsDebounceRef.current = window.setTimeout(() => {
      loadSuggestions({ wordId, dialectTag, query })
        .unwrap()
        .then((result) => setSuggestions(result.suggestions))
        .catch(() => setSuggestions([]));
    }, 250);
    return () => {
      if (suggestionsDebounceRef.current !== null) window.clearTimeout(suggestionsDebounceRef.current);
    };
  }, [assignment, loadSuggestions, responseText]);

  async function closeDialog() {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    releaseMicrophone();
    if (session) void endSession(session.sessionId);
    setSession(null);
    onOpenChange(false);
  }

  async function beginSession() {
    if (!accepted) return;
    setError(null);
    setStep('loading');
    try {
      const created = await startSession({ acceptedVoiceTerms: true }).unwrap();
      setSession(created);
      try {
        const next = await loadNext(created.sessionId, false).unwrap();
        setAssignment(next);
        setStep('training');
      } catch (err) {
        void endSession(created.sessionId);
        setSession(null);
        if (isNoWordsAvailable(err)) {
          setStep('unavailable');
          return;
        }
        throw err;
      }
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to start a training session.'));
      setStep('terms');
    }
  }

  async function nextWord() {
    if (!session) return;
    setError(null);
    sourceAudioRef.current?.pause();
    clearRecording();
    setResponseText('');
    setAssignment(null);
    setSuggestions([]);
    setSuggestionsOpen(false);
    setKeyboardOpen(false);
    setPickedIndexes([]);
    setRebuildSubmitting(false);
    setRebuildSubmitted(false);
    setRebuildScore(null);
    setSourcePlaying(false);
    try {
      setAssignment(await loadNext(session.sessionId, false).unwrap());
    } catch (err) {
      if (isNoWordsAvailable(err)) {
        setStep('unavailable');
        return;
      }
      setError(normalizeErrorMessage(err, 'Unable to load the next word.'));
    }
  }

  const canSkipAssignment =
    !!assignment &&
    !isLoadingNext &&
    !rebuildSubmitting &&
    !rebuildSubmitted &&
    recorderState !== 'recording' &&
    recorderState !== 'submitting' &&
    recorderState !== 'submitted';

  async function startRecording() {
    if (!assignment) return;
    setError(null);
    clearRecording();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;
      const mimeType = preferredMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];
      noiseTotalRef.current = 0;
      noiseSamplesRef.current = 0;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const duration = Math.min(maxRecordingMs, Math.max(1, Date.now() - startedAtRef.current));
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        const url = URL.createObjectURL(blob);
        const averageNoise = noiseSamplesRef.current ? noiseTotalRef.current / noiseSamplesRef.current : 0;
        setElapsedMs(duration);
        setNoiseRating(classifyNoise(averageNoise));
        setAudioBlob(blob);
        setAudioUrl(url);
        setRecorderState('recorded');
        releaseMicrophone();
      };

      monitorSignal(stream);
      startedAtRef.current = Date.now();
      setRecorderState('recording');
      recorder.start(250);
      timerRef.current = window.setInterval(() => {
        const elapsed = Math.min(maxRecordingMs, Date.now() - startedAtRef.current);
        setElapsedMs(elapsed);
        if (elapsed >= maxRecordingMs && recorder.state === 'recording') recorder.stop();
      }, 100);
    } catch (err) {
      releaseMicrophone();
      setError(err instanceof DOMException && err.name === 'NotAllowedError'
        ? 'Microphone permission is required to record.'
        : 'The microphone could not be started.');
    }
  }

  function monitorSignal(stream: MediaStream) {
    const context = new AudioContext();
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    context.createMediaStreamSource(stream).connect(analyser);
    audioContextRef.current = context;
    const samples = new Uint8Array(analyser.fftSize);

    const read = () => {
      analyser.getByteTimeDomainData(samples);
      let sum = 0;
      for (const sample of samples) {
        const normalized = (sample - 128) / 128;
        sum += normalized * normalized;
      }
      const rms = Math.sqrt(sum / samples.length);
      noiseTotalRef.current += rms;
      noiseSamplesRef.current += 1;
      const now = performance.now();
      if (now - lastNoiseRenderRef.current >= 160) {
        setNoiseRating(classifyNoise(rms));
        lastNoiseRenderRef.current = now;
      }
      animationFrameRef.current = requestAnimationFrame(read);
    };
    read();
  }

  function insertCharacter(char: string) {
    const input = responseInputRef.current;
    const start = input?.selectionStart ?? responseText.length;
    const end = input?.selectionEnd ?? responseText.length;
    const next = responseText.slice(0, start) + char + responseText.slice(end);
    setResponseText(next);
    const cursor = start + char.length;
    requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(cursor, cursor);
    });
  }

  function stopRecording() {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
  }

  function togglePlayback() {
    const audio = audioRef.current;
    if (!audio) return;
    if (recorderState === 'playing') {
      audio.pause();
      setRecorderState('paused');
      return;
    }
    void audio.play();
    setRecorderState('playing');
  }

  function toggleSourcePlayback() {
    const audio = sourceAudioRef.current;
    if (!audio) return;
    if (sourcePlaying) {
      audio.pause();
      return;
    }
    void audio.play();
  }

  async function saveRecording() {
    if (!assignment || !audioBlob || !responseText.trim()) {
      setError('Enter the spelling and record the word before submitting.');
      return;
    }
    setError(null);
    setRecorderState('submitting');
    try {
      const uploadContentType = audioBlob.type.split(';')[0] || 'audio/webm';
      const upload = await createUpload({ assignmentId: assignment.assignmentId, contentType: uploadContentType }).unwrap();
      const uploaded = await fetch(upload.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': uploadContentType },
        body: audioBlob,
      });
      if (!uploaded.ok) throw new Error('The audio upload failed. Please try again.');

      const result = await submitRecording({
        assignmentId: assignment.assignmentId,
        responseText: responseText.trim(),
        bucket: upload.bucket,
        audioKey: upload.key,
        durationMs: Math.max(1, Math.round(elapsedMs)),
        noiseRating,
      }).unwrap();
      setScore(result.validationScore);
      setRecorderState('submitted');
    } catch (err) {
      setError(normalizeErrorMessage(err, err instanceof Error ? err.message : 'Unable to submit the recording.'));
      setRecorderState('recorded');
    }
  }

  async function submitSentenceRebuild() {
    if (!assignment || !assignment.fragments || pickedIndexes.length !== assignment.fragments.length) {
      setError('Tap all the fragments in order before submitting.');
      return;
    }
    setError(null);
    setRebuildSubmitting(true);
    try {
      const submittedOrder = pickedIndexes.map((index) => assignment.fragments![index].position);
      const result = await submitRecording({
        assignmentId: assignment.assignmentId,
        submittedOrder,
      }).unwrap();
      setRebuildScore(result.validationScore);
      setRebuildSubmitted(true);
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to submit your answer.'));
    } finally {
      setRebuildSubmitting(false);
    }
  }

  function pickFragment(index: number) {
    if (pickedIndexes.includes(index)) return;
    setPickedIndexes((current) => [...current, index]);
  }

  function unpickLast() {
    setPickedIndexes((current) => current.slice(0, -1));
  }

  const progress = Math.min(1, elapsedMs / maxRecordingMs);
  const ringColor = noiseColor(noiseRating);

  return (
    <RadixDialog.Root open={open} onOpenChange={(nextOpen) => { if (!nextOpen) void closeDialog(); }}>
      <RadixDialog.Portal container={portalContainer}>
        <RadixDialog.Overlay className="fixed inset-0 z-40 bg-black/65 data-[state=open]:animate-[fadeIn_150ms_ease-out]" />
        <RadixDialog.Content
          aria-describedby="word-training-description"
          className="fixed inset-0 z-50 overflow-y-auto bg-bg text-ink focus:outline-none data-[state=open]:animate-[fadeIn_150ms_ease-out]"
          onEscapeKeyDown={(event) => { if (recorderState === 'recording') event.preventDefault(); }}
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <header className="sticky top-0 z-10 border-b border-line bg-surface/95 backdrop-blur">
            <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-4 md:px-6">
              <div className="flex min-w-0 items-center gap-3">
                {step === 'terms' ? (
                  <button aria-label="Back to task selection" className="grid size-10 place-items-center rounded-lg hover:bg-surface-muted" onClick={() => setStep('select')} type="button">
                    <ArrowLeft className="size-5" aria-hidden="true" />
                  </button>
                ) : null}
                <div className="min-w-0">
                  <RadixDialog.Title className="truncate text-lg font-black">Word training</RadixDialog.Title>
                  <RadixDialog.Description className="truncate text-xs font-semibold text-muted" id="word-training-description">
                    {session ? `${session.dialectName} session` : 'Voice contribution session'}
                  </RadixDialog.Description>
                </div>
              </div>
              <button aria-label="Close training" className="grid size-10 place-items-center rounded-lg border border-line bg-surface hover:bg-surface-muted" onClick={() => void closeDialog()} type="button">
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>
          </header>

          <main className="mx-auto grid min-h-[calc(100dvh-4rem)] w-full max-w-5xl content-center px-4 py-8 md:px-6">
            {step === 'select' && (
              <section className="mx-auto grid w-full max-w-xl gap-6">
                <div>
                  <p className="text-sm font-extrabold text-accent">Select task</p>
                  <h2 className="mt-1 text-3xl font-black">Choose your training task</h2>
                </div>
                <button className="grid grid-cols-[auto_1fr_auto] items-center gap-4 rounded-lg border-2 border-accent bg-surface p-5 text-left shadow-[0_12px_32px_rgba(88,28,135,0.10)]" onClick={() => setStep('terms')} type="button">
                  <span className="grid size-12 place-items-center rounded-lg bg-accent-soft text-accent"><BookOpenCheck className="size-6" aria-hidden="true" /></span>
                  <span>
                    <span className="block text-lg font-black">Word training</span>
                    <span className="mt-1 block text-sm leading-relaxed text-muted">Translation, pronunciation, and reverse validation.</span>
                  </span>
                  <ArrowRight className="size-5 text-accent" aria-hidden="true" />
                </button>
              </section>
            )}

            {step === 'terms' && (
              <section className="mx-auto grid w-full max-w-2xl gap-6 rounded-lg border border-line bg-surface p-5 md:p-7">
                <div>
                  <p className="text-sm font-extrabold text-accent">Voice data agreement</p>
                  <h2 className="mt-1 text-2xl font-black">Consent to AI training use</h2>
                </div>
                <div className="grid gap-3 text-sm leading-7 text-muted md:text-base">
                  <p>You confirm that the recordings are your voice and that you are at least 18 years old.</p>
                  <p>You grant Dialect Library permission to store, process, analyze, license, and use your recordings, typed translations, and derived data to develop, evaluate, and improve speech and artificial intelligence systems.</p>
                  <p>This permission is worldwide, perpetual, and may include sharing de-identified training data with approved research or commercial partners. Your account identity will not be included in licensed audio datasets.</p>
                </div>
                <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-surface-muted p-4" htmlFor="voice-consent">
                  <input checked={accepted} className="mt-0.5 size-5 accent-accent" id="voice-consent" onChange={(event) => setAccepted(event.target.checked)} type="checkbox" />
                  <span className="text-sm font-bold leading-6">I have read and agree to the voice data agreement and the <a className="text-accent underline" href="/terms" target="_blank">Terms of Use</a>.</span>
                </label>
                {error && <p className="text-sm font-bold text-danger" role="alert">{error}</p>}
                <button className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-accent px-5 font-extrabold text-white hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-45" disabled={!accepted || isStarting} onClick={() => void beginSession()} type="button">
                  {isStarting ? <LoaderCircle className="size-5 animate-spin" aria-hidden="true" /> : <Mic className="size-5" aria-hidden="true" />}
                  {isStarting ? 'Starting session' : 'Agree and start'}
                </button>
              </section>
            )}

            {step === 'loading' && <LoadingState label="Preparing your first word" />}

            {step === 'training' && (
              <section className="mx-auto grid w-full max-w-3xl gap-6 text-center">
                {!assignment ? <LoadingState label="Generating next word" /> : assignment.direction === 'SENTENCE_REBUILD' ? (
                  <>
                    <div>
                      <div className="flex flex-wrap items-center justify-center gap-3">
                        <span className="inline-flex rounded-full bg-accent-soft px-3 py-1 text-xs font-extrabold text-accent">
                          {assignment.responseLanguage} sentence rebuild
                        </span>
                        <SkipAssignmentButton disabled={!canSkipAssignment} loading={isLoadingNext} onClick={() => void nextWord()} />
                      </div>
                      <p className="mt-4 text-sm font-bold text-muted">Tap the fragments in the correct order</p>
                    </div>

                    <div className="mx-auto flex min-h-16 w-full max-w-xl flex-wrap items-center justify-center gap-2 rounded-lg border-2 border-dashed border-line bg-surface p-4">
                      {pickedIndexes.length === 0 && <span className="text-sm text-muted">Tap fragments below to build the sentence</span>}
                      {pickedIndexes.map((index, position) => (
                        <span className="rounded-md bg-accent px-3 py-1.5 font-bold text-white" key={`${index}-${position}`}>
                          {assignment.fragments![index].text}
                        </span>
                      ))}
                    </div>

                    <div className="mx-auto flex w-full max-w-xl flex-wrap items-center justify-center gap-2">
                      {assignment.fragments!.map((fragment, index) => (
                        <button
                          className="rounded-md border border-line bg-white px-3 py-1.5 font-bold hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-40"
                          disabled={pickedIndexes.includes(index) || rebuildSubmitting || rebuildSubmitted}
                          key={index}
                          onClick={() => pickFragment(index)}
                          type="button"
                        >
                          {fragment.text}
                        </button>
                      ))}
                    </div>

                    {error && <p className="text-sm font-bold text-danger" role="alert">{error}</p>}

                    {!rebuildSubmitted && (
                      <div className="flex flex-wrap items-center justify-center gap-3">
                        <button
                          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line bg-surface px-5 font-extrabold hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-45"
                          disabled={pickedIndexes.length === 0 || rebuildSubmitting}
                          onClick={unpickLast}
                          type="button"
                        >
                          <RotateCcw className="size-4" aria-hidden="true" />
                          Undo
                        </button>
                        <ActionButton
                          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-accent px-5 font-extrabold text-white hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-45"
                          disabled={pickedIndexes.length !== assignment.fragments!.length}
                          onClick={() => void submitSentenceRebuild()}
                          pending={rebuildSubmitting}
                          pendingLabel="Submitting"
                          type="button"
                        >
                          <Send className="size-4" aria-hidden="true" />
                          Submit
                        </ActionButton>
                      </div>
                    )}

                    {rebuildSubmitted && (
                      <div className="mx-auto grid w-full max-w-md gap-4 rounded-lg border border-line bg-surface p-5">
                        <div className="flex items-center justify-center gap-2 font-black text-emerald-700 dark:text-emerald-300"><Check className="size-5" aria-hidden="true" />Answer submitted</div>
                        {rebuildScore !== null && <p className="text-sm font-bold text-muted">Order match: {rebuildScore === 1 ? 'Correct' : 'Not quite'}</p>}
                        <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-accent px-5 font-extrabold text-white hover:bg-accent-dark" onClick={() => void nextWord()} type="button">Next word <ArrowRight className="size-4" aria-hidden="true" /></button>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div>
                      <div className="flex flex-wrap items-center justify-center gap-3">
                        <span className="inline-flex rounded-full bg-accent-soft px-3 py-1 text-xs font-extrabold text-accent">
                          {assignment.sourceLanguage} to {assignment.responseLanguage}
                        </span>
                        <SkipAssignmentButton disabled={!canSkipAssignment} loading={isLoadingNext} onClick={() => void nextWord()} />
                      </div>
                      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-muted px-2.5 py-1 text-xs font-extrabold text-muted">
                          <span aria-hidden="true">{assignment.direction === 'DIALECT_TO_ENGLISH' ? '🔊' : '💬'}</span>
                          {assignment.direction === 'DIALECT_TO_ENGLISH' ? `Listen in ${assignment.sourceLanguage}` : `Shown in ${assignment.sourceLanguage}`}
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
                        <h2 className="break-words text-4xl font-black md:text-6xl">{assignment.promptText}</h2>
                        {assignment.sourceAudioUrl && (
                          <button
                            aria-label={sourcePlaying ? 'Pause dialect recording' : 'Play dialect recording'}
                            className="grid size-11 shrink-0 place-items-center rounded-full bg-accent text-white shadow-[0_8px_20px_rgba(126,34,206,0.3)] transition-transform hover:bg-accent-dark active:scale-95"
                            onClick={toggleSourcePlayback}
                            type="button"
                          >
                            {sourcePlaying ? <Pause className="size-5 fill-current" aria-hidden="true" /> : <Play className="ml-0.5 size-5 fill-current" aria-hidden="true" />}
                          </button>
                        )}
                      </div>
                      {assignment.sourceAudioUrl && (
                        <audio
                          onEnded={() => setSourcePlaying(false)}
                          onPause={() => setSourcePlaying(false)}
                          onPlay={() => setSourcePlaying(true)}
                          ref={sourceAudioRef}
                          src={assignment.sourceAudioUrl}
                        />
                      )}
                    </div>

                    <div className="mx-auto grid w-full max-w-md gap-2 text-left">
                      <label className="flex items-center gap-1.5 text-sm font-extrabold" htmlFor="training-response">
                        <span className="grid size-5 shrink-0 place-items-center rounded-full bg-accent-soft text-[11px] font-black text-accent">1</span>
                        Type it in {assignment.responseLanguage}</label>
                      <RadixPopover.Root open={suggestionsOpen && suggestions.length > 0} onOpenChange={setSuggestionsOpen}>
                        <RadixPopover.Anchor asChild>
                          <div className="relative">
                            <input
                              autoComplete="off"
                              className="min-h-12 w-full rounded-lg border border-line bg-surface px-4 text-base font-bold outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft disabled:opacity-60"
                              disabled={recorderState === 'submitting' || recorderState === 'submitted'}
                              id="training-response"
                              onChange={(event) => {
                                setResponseText(event.target.value);
                                setSuggestionsOpen(true);
                              }}
                              onFocus={() => setSuggestionsOpen(true)}
                              placeholder={`Type the ${assignment.responseLanguage} spelling`}
                              ref={responseInputRef}
                              value={responseText}
                            />
                            {assignment.dialectKeyboardLayout && (
                              <button
                                aria-label={keyboardOpen ? 'Hide dialect keyboard' : 'Show dialect keyboard'}
                                aria-pressed={keyboardOpen}
                                className={`absolute right-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-md transition-colors ${
                                  keyboardOpen ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-surface-muted'
                                }`}
                                disabled={recorderState === 'submitting' || recorderState === 'submitted'}
                                onClick={() => setKeyboardOpen((current) => !current)}
                                type="button"
                              >
                                <Keyboard className="size-4" aria-hidden="true" />
                              </button>
                            )}
                          </div>
                        </RadixPopover.Anchor>
                        <RadixPopover.Portal container={portalContainer}>
                          <RadixPopover.Content
                            align="start"
                            className="z-60 w-[min(var(--container-md),90vw)] rounded-lg border border-line bg-surface p-1.5 shadow-[0_12px_32px_rgba(27,31,27,0.15)]"
                            onOpenAutoFocus={(event) => event.preventDefault()}
                            sideOffset={6}
                          >
                            <ul className="grid gap-0.5">
                              {suggestions.map((suggestion) => (
                                <li key={`${suggestion.source}-${suggestion.text}`}>
                                  <button
                                    className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left font-bold hover:bg-surface-muted"
                                    onClick={() => {
                                      setResponseText(suggestion.text);
                                      setSuggestionsOpen(false);
                                      responseInputRef.current?.focus();
                                    }}
                                    type="button"
                                  >
                                    <span>{suggestion.text}</span>
                                    <span
                                      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-extrabold ${
                                        suggestion.source === 'community' ? 'bg-emerald-100 text-emerald-700' : 'bg-accent-soft text-accent'
                                      }`}
                                    >
                                      {suggestion.source === 'community' ? 'Community' : 'AI'}
                                    </span>
                                  </button>
                                </li>
                              ))}
                            </ul>
                          </RadixPopover.Content>
                        </RadixPopover.Portal>
                      </RadixPopover.Root>

                      {keyboardOpen && assignment.dialectKeyboardLayout && (
                        <div className="flex flex-wrap gap-1.5 rounded-lg border border-line bg-surface p-2">
                          {assignment.dialectKeyboardLayout.split(/\s+/).filter(Boolean).map((char) => (
                            <button
                              className="grid min-w-9 place-items-center rounded-md border border-line bg-white px-2 py-1.5 text-base font-bold hover:bg-surface-muted"
                              key={char}
                              onClick={() => insertCharacter(char)}
                              type="button"
                            >
                              {char}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="mx-auto grid w-full max-w-md justify-items-center gap-1 text-center">
                      <p className="flex items-center gap-1.5 text-sm font-extrabold">
                        <span className="grid size-5 shrink-0 place-items-center rounded-full bg-accent-soft text-[11px] font-black text-accent">2</span>
                        Say it in {assignment.direction === 'DIALECT_TO_ENGLISH' ? assignment.sourceLanguage : assignment.responseLanguage}
                      </p>
                      {assignment.direction === 'DIALECT_TO_ENGLISH' && (
                        <p className="text-xs font-bold text-muted">Your own {assignment.sourceLanguage} pronunciation of this word -- not the English you typed above.</p>
                      )}
                    </div>

                    <div className="relative mx-auto grid size-[248px] place-items-center md:size-[288px]">
                      <svg aria-hidden="true" className="absolute inset-0 size-full -rotate-90" viewBox="0 0 240 240">
                        <circle cx="120" cy="120" fill="none" r={RING_RADIUS} stroke="var(--line)" strokeWidth="12" />
                        <circle cx="120" cy="120" fill="none" r={RING_RADIUS} stroke={ringColor} strokeDasharray={RING_CIRCUMFERENCE} strokeDashoffset={RING_CIRCUMFERENCE * (1 - progress)} strokeLinecap="round" strokeWidth="12" className="transition-[stroke,stroke-dashoffset] duration-100" />
                      </svg>
                      <button
                        aria-label={recorderButtonLabel(recorderState)}
                        className="relative z-[1] grid size-36 place-items-center rounded-full bg-accent text-white shadow-[0_14px_40px_rgba(126,34,206,0.3)] transition-transform active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 md:size-40"
                        disabled={recorderState === 'submitting' || recorderState === 'submitted'}
                        onClick={() => {
                          if (recorderState === 'ready') void startRecording();
                          else if (recorderState === 'recording') stopRecording();
                          else togglePlayback();
                        }}
                        type="button"
                      >
                        {recorderState === 'recording' ? <Square className="size-12 fill-current" aria-hidden="true" /> : recorderState === 'playing' ? <Pause className="size-12 fill-current" aria-hidden="true" /> : recorderState === 'recorded' || recorderState === 'paused' ? <Play className="ml-1 size-12 fill-current" aria-hidden="true" /> : recorderState === 'submitting' ? <LoaderCircle className="size-12 animate-spin" aria-hidden="true" /> : recorderState === 'submitted' ? <Check className="size-14" aria-hidden="true" /> : <Mic className="size-14" aria-hidden="true" />}
                      </button>
                    </div>

                    <div className="flex items-center justify-center gap-3 text-sm font-bold">
                      <span>{formatDuration(elapsedMs)} / {formatDuration(maxRecordingMs)}</span>
                      <span aria-hidden="true" className="text-line">|</span>
                      <span className="inline-flex items-center gap-2"><span className="size-2.5 rounded-full" style={{ backgroundColor: ringColor }} />{noiseLabel(noiseRating)}</span>
                    </div>

                    {audioUrl && <audio onEnded={() => setRecorderState('recorded')} ref={audioRef} src={audioUrl} />}
                    {error && <p className="text-sm font-bold text-danger" role="alert">{error}</p>}

                    {(recorderState === 'recorded' || recorderState === 'paused' || recorderState === 'playing') && (
                      <div className="flex flex-wrap items-center justify-center gap-3">
                        <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line bg-surface px-5 font-extrabold hover:bg-surface-muted" onClick={clearRecording} type="button"><Trash2 className="size-4" aria-hidden="true" />Delete</button>
                        <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-accent px-5 font-extrabold text-white hover:bg-accent-dark disabled:opacity-45" disabled={!responseText.trim()} onClick={() => void saveRecording()} type="button"><Send className="size-4" aria-hidden="true" />Submit</button>
                      </div>
                    )}

                    {recorderState === 'submitted' && (
                      <div className="mx-auto grid w-full max-w-md gap-4 rounded-lg border border-line bg-surface p-5">
                        <div className="flex items-center justify-center gap-2 font-black text-emerald-700 dark:text-emerald-300"><Check className="size-5" aria-hidden="true" />Recording submitted</div>
                        {score !== null && <p className="text-sm font-bold text-muted">Validation match: {score === 1 ? 'Confirmed' : 'Needs review'}</p>}
                        <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-accent px-5 font-extrabold text-white hover:bg-accent-dark" onClick={() => void nextWord()} type="button">Next word <ArrowRight className="size-4" aria-hidden="true" /></button>
                      </div>
                    )}
                  </>
                )}
              </section>
            )}

            {step === 'unavailable' && (
              <section className="mx-auto grid w-full max-w-md gap-4 text-center">
                <span className="mx-auto grid size-14 place-items-center rounded-full bg-accent-soft text-accent">
                  <Clock3 className="size-7" aria-hidden="true" />
                </span>
                <h2 className="text-2xl font-black">No words available right now</h2>
                <p className="leading-relaxed text-muted">
                  The word dictionary is temporarily empty for your dialect. Check back later -- new words are added
                  regularly.
                </p>
                <button className="mx-auto inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line bg-surface px-5 font-extrabold hover:bg-surface-muted" onClick={() => void closeDialog()} type="button">
                  Close
                </button>
              </section>
            )}
          </main>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

function SkipAssignmentButton({
  disabled,
  loading,
  onClick,
}: {
  disabled: boolean;
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-full border border-line bg-surface px-3 text-xs font-extrabold text-muted transition-colors hover:bg-surface-muted hover:text-ink disabled:cursor-not-allowed disabled:opacity-45"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {loading ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" /> : <ArrowRight className="size-3.5" aria-hidden="true" />}
      {loading ? 'Loading' : 'Skip / next'}
    </button>
  );
}

function LoadingState({ label }: { label: string }) {
  return <div className="grid place-items-center gap-3 py-16 text-center" role="status"><LoaderCircle className="size-8 animate-spin text-accent" aria-hidden="true" /><p className="font-extrabold">{label}</p></div>;
}

function preferredMimeType(): string | undefined {
  return ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'].find((type) => MediaRecorder.isTypeSupported(type));
}

function classifyNoise(rms: number): RecordingNoiseRating {
  if (rms >= 0.22) return 'NOISY';
  if (rms >= 0.09) return 'FAIR';
  return 'QUIET';
}

function noiseColor(rating: RecordingNoiseRating): string {
  if (rating === 'NOISY') return '#dc2626';
  if (rating === 'FAIR') return '#f59e0b';
  return '#10b981';
}

function noiseLabel(rating: RecordingNoiseRating): string {
  if (rating === 'NOISY') return 'Noisy';
  if (rating === 'FAIR') return 'Less noisy';
  return 'Quiet';
}

function recorderButtonLabel(state: RecorderState): string {
  if (state === 'recording') return 'Stop recording';
  if (state === 'playing') return 'Pause playback';
  if (state === 'recorded' || state === 'paused') return 'Play recording';
  return 'Start recording';
}

function formatDuration(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

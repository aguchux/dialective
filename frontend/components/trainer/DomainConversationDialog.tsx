'use client';

import * as RadixDialog from '@radix-ui/react-dialog';
import {
  ArrowRight,
  Check,
  Clock3,
  LoaderCircle,
  Mic,
  Pause,
  Play,
  Send,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession as useAuthSession } from 'next-auth/react';
import { usePortalContainer } from '@/components/ui/PortalContainer';
import { notifyFullScreenOverlay } from '@/lib/recording-signal';
import { QracDialog } from '@/components/trainer/QracDialog';
import {
  ApiErrorShape,
  DomainConversationPrompt,
  RecordingNoiseRating,
  normalizeErrorMessage,
  useCreateDomainConversationRecordingUploadMutation,
  useEndWordTrainingSessionMutation,
  useLazyGetNextDomainConversationPromptQuery,
  useStartWordTrainingSessionMutation,
  useSubmitDomainConversationRecordingMutation,
} from '@/store/api';

function extractQracRequired(err: unknown): boolean {
  const data = (err as { data?: ApiErrorShape } | undefined)?.data;
  return !!data?.qracRequired;
}

function isNoPromptsAvailable(err: unknown): boolean {
  const message = (err as { data?: ApiErrorShape } | undefined)?.data?.message;
  const text = Array.isArray(message) ? message.join(' ') : message;
  return text === 'NO_DOMAIN_PROMPTS_AVAILABLE';
}

function extractRequiredCourses(
  err: unknown,
): { id: string; slug: string; title: string }[] | null {
  const data = (err as { data?: ApiErrorShape } | undefined)?.data;
  return data?.requiredCourses && data.requiredCourses.length > 0 ? data.requiredCourses : null;
}

function hasInsufficientBalance(err: unknown): boolean {
  const data = (err as { data?: ApiErrorShape } | undefined)?.data;
  return data?.insufficientBalance === true;
}

const MIC_PERMISSION_ERROR = 'Microphone permission is required to record.';
const DEFAULT_MIN_DURATION_SECONDS = 15;
const DEFAULT_MAX_DURATION_SECONDS = 60;
const RING_RADIUS = 104;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const HEARTBEAT_MIN_INTERVAL_MS = 2 * 60_000;

type FlowStep = 'terms' | 'loading' | 'training' | 'unavailable';
type RecorderState =
  'ready' | 'recording' | 'recorded' | 'playing' | 'paused' | 'submitting' | 'submitted';

/**
 * "Domain Conversation" task -- sibling to WordTrainingDialog, opened past
 * task selection (see TaskPickerDialog). Shares the same TrainingSession
 * lifecycle (start/end/QRAC) via WordsController's endpoints, but its own
 * prompt/upload/submit endpoints (DomainConversationsService). The
 * MediaRecorder/AudioContext capture internals below are copied from
 * WordTrainingDialog's startRecording/monitorSignal (accepted duplication
 * for v1 -- see the implementation plan's note on extracting a shared
 * useVoiceRecorder hook as a follow-up). What's genuinely different is the
 * min/max duration GATE: elapsedMs counts up the same way, but the Submit/
 * Stop control stays disabled until minDurationMs is reached, instead of
 * WordTrainingDialog's fixed countdown-to-ceiling with no minimum.
 */
export function DomainConversationDialog({
  open,
  onOpenChange,
  onRequiredCourses,
  onInsufficientBalance,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRequiredCourses?: (courses: { id: string; slug: string; title: string }[]) => void;
  onInsufficientBalance?: () => void;
}) {
  const portalContainer = usePortalContainer();
  const { status: authStatus, update: updateAuthSession } = useAuthSession();
  const lastHeartbeatAtRef = useRef(0);
  const [step, setStep] = useState<FlowStep>('terms');
  const [accepted, setAccepted] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<DomainConversationPrompt | null>(null);
  const [recorderState, setRecorderState] = useState<RecorderState>('ready');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [noiseRating, setNoiseRating] = useState<RecordingNoiseRating>('QUIET');
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [qracOpen, setQracOpen] = useState(false);
  const submittingRef = useRef(false);

  const [startSession, { isLoading: isStarting }] = useStartWordTrainingSessionMutation();
  const [loadNext, { isFetching: isLoadingNext }] = useLazyGetNextDomainConversationPromptQuery();
  const [endSession] = useEndWordTrainingSessionMutation();
  const [createUpload] = useCreateDomainConversationRecordingUploadMutation();
  const [submitRecording] = useSubmitDomainConversationRecordingMutation();

  const minDurationSeconds =
    prompt && Number.isFinite(prompt.minDurationSeconds) && prompt.minDurationSeconds > 0
      ? prompt.minDurationSeconds
      : DEFAULT_MIN_DURATION_SECONDS;
  const maxDurationSeconds =
    prompt && Number.isFinite(prompt.maxDurationSeconds) && prompt.maxDurationSeconds > 0
      ? prompt.maxDurationSeconds
      : DEFAULT_MAX_DURATION_SECONDS;
  const minDurationMs = minDurationSeconds * 1000;
  const maxDurationMs = maxDurationSeconds * 1000;

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
    chunksRef.current = [];
  }, [audioUrl]);

  useEffect(
    () => () => {
      releaseMicrophone();
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    },
    [audioUrl, releaseMicrophone],
  );

  useEffect(() => {
    if (open) return;
    releaseMicrophone();
    clearRecording();
    setStep('terms');
    setAccepted(false);
    setPrompt(null);
    setError(null);
    setQracOpen(false);
  }, [clearRecording, open, releaseMicrophone]);

  useEffect(() => {
    notifyFullScreenOverlay(open);
    return () => notifyFullScreenOverlay(false);
  }, [open]);

  useEffect(() => {
    if (!open || authStatus !== 'authenticated') return;
    function heartbeat() {
      const now = Date.now();
      if (now - lastHeartbeatAtRef.current < HEARTBEAT_MIN_INTERVAL_MS) return;
      lastHeartbeatAtRef.current = now;
      void updateAuthSession({ lastActiveAt: now });
    }
    heartbeat();
    const interval = setInterval(heartbeat, HEARTBEAT_MIN_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [open, authStatus, updateAuthSession]);

  async function closeDialog() {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    releaseMicrophone();
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
        setPrompt(next);
        setStep('training');
      } catch (err) {
        if (extractQracRequired(err)) {
          setQracOpen(true);
          return;
        }
        void endSession(created.sessionId);
        setSessionId(null);
        if (isNoPromptsAvailable(err)) {
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
      if (hasInsufficientBalance(err) && onInsufficientBalance) {
        onOpenChange(false);
        onInsufficientBalance();
        return;
      }
      setError(normalizeErrorMessage(err, 'Unable to start a training session.'));
      setStep('terms');
    }
  }

  async function nextPrompt() {
    if (!sessionId) return;
    setError(null);
    clearRecording();
    setPrompt(null);
    try {
      setPrompt(await loadNext(sessionId, false).unwrap());
      setStep('training');
    } catch (err) {
      if (isNoPromptsAvailable(err)) {
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
      if (hasInsufficientBalance(err) && onInsufficientBalance) {
        void endSession(sessionId);
        setSessionId(null);
        onOpenChange(false);
        onInsufficientBalance();
        return;
      }
      setError(normalizeErrorMessage(err, 'Unable to load the next prompt.'));
    }
  }

  async function handleQracSigned() {
    setQracOpen(false);
    void nextPrompt();
  }

  async function handleQracEndSession() {
    setQracOpen(false);
    void closeDialog();
  }

  async function startRecording() {
    if (!prompt) return;
    setError(null);
    clearRecording();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;
      const mimeType = preferredMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];
      noiseTotalRef.current = 0;
      noiseSamplesRef.current = 0;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const duration = Math.min(maxDurationMs, Math.max(1, Date.now() - startedAtRef.current));
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        const url = URL.createObjectURL(blob);
        const averageNoise = noiseSamplesRef.current
          ? noiseTotalRef.current / noiseSamplesRef.current
          : 0;
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
        const elapsed = Math.min(maxDurationMs, Date.now() - startedAtRef.current);
        setElapsedMs(elapsed);
        if (elapsed >= maxDurationMs && recorder.state === 'recording') recorder.stop();
      }, 100);
    } catch (err) {
      releaseMicrophone();
      setError(
        err instanceof DOMException && err.name === 'NotAllowedError'
          ? MIC_PERMISSION_ERROR
          : 'The microphone could not be started.',
      );
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

  function stopRecording() {
    if (recorderRef.current?.state !== 'recording') return;
    // The min-duration gate: recording won't stop via the button before the
    // admin-configured minimum elapses (the ring/button itself is disabled
    // below in that window too -- this is a second, defensive guard).
    if (elapsedMs < minDurationMs) return;
    recorderRef.current.stop();
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

  async function saveRecording() {
    if (!prompt || !audioBlob) return;
    if (submittingRef.current) return;
    submittingRef.current = true;
    setError(null);
    setRecorderState('submitting');
    try {
      const uploadContentType = audioBlob.type.split(';')[0] || 'audio/webm';
      const upload = await createUpload({
        assignmentId: prompt.assignmentId,
        contentType: uploadContentType,
      }).unwrap();
      const uploaded = await fetch(upload.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': uploadContentType },
        body: audioBlob,
      });
      if (!uploaded.ok) throw new Error('The audio upload failed. Please try again.');

      await submitRecording({
        assignmentId: prompt.assignmentId,
        bucket: upload.bucket,
        audioKey: upload.key,
        durationMs: Math.max(1, Math.round(elapsedMs)),
        noiseRating,
      }).unwrap();
      setRecorderState('submitted');
    } catch (err) {
      setError(
        normalizeErrorMessage(
          err,
          err instanceof Error ? err.message : 'Unable to submit the recording.',
        ),
      );
      setRecorderState('recorded');
    } finally {
      submittingRef.current = false;
    }
  }

  const progress = Math.min(1, elapsedMs / maxDurationMs);
  const ringColor = noiseColor(noiseRating);
  const remainingUntilUnlockSeconds = Math.max(0, Math.ceil((minDurationMs - elapsedMs) / 1000));
  const stopDisabledByMinGate = recorderState === 'recording' && elapsedMs < minDurationMs;

  return (
    <>
      <RadixDialog.Root
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) void closeDialog();
        }}
      >
        <RadixDialog.Portal container={portalContainer}>
          <RadixDialog.Overlay className="fixed inset-0 z-40 bg-black/65 data-[state=open]:animate-[fadeIn_150ms_ease-out]" />
          <RadixDialog.Content
            aria-describedby="domain-conversation-description"
            className="fixed inset-0 z-50 overflow-y-auto bg-bg text-ink focus:outline-none data-[state=open]:animate-[fadeIn_150ms_ease-out]"
            onEscapeKeyDown={(event) => {
              if (recorderState === 'recording') event.preventDefault();
            }}
            onOpenAutoFocus={(event) => event.preventDefault()}
          >
            <header className="sticky top-0 z-10 border-b border-line bg-surface/95 backdrop-blur">
              <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-4 md:px-6">
                <div className="min-w-0">
                  <RadixDialog.Title className="truncate text-lg font-black">
                    Domain Conversation
                  </RadixDialog.Title>
                  <RadixDialog.Description
                    className="truncate text-xs font-semibold text-muted"
                    id="domain-conversation-description"
                  >
                    Voice contribution session
                  </RadixDialog.Description>
                </div>
                <button
                  aria-label="Close training"
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
                    <p className="text-sm font-extrabold text-accent">Voice data agreement</p>
                    <h2 className="mt-1 text-2xl font-black">Consent to AI training use</h2>
                  </div>
                  <div className="grid gap-3 text-sm leading-7 text-muted md:text-base">
                    <p>
                      You confirm that the recordings are your voice and that you are at least 18
                      years old.
                    </p>
                    <p>
                      You grant Dialect Library permission to store, process, analyze, license, and
                      use your recordings and derived data to develop, evaluate, and improve speech
                      and artificial intelligence systems.
                    </p>
                    <p>
                      This permission is worldwide, perpetual, and may include sharing de-identified
                      training data with approved research or commercial partners. Your account
                      identity will not be included in licensed audio datasets.
                    </p>
                  </div>
                  <label
                    className="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-surface-muted p-4"
                    htmlFor="domain-conversation-consent"
                  >
                    <input
                      checked={accepted}
                      className="mt-0.5 size-5 accent-accent"
                      id="domain-conversation-consent"
                      onChange={(event) => setAccepted(event.target.checked)}
                      type="checkbox"
                    />
                    <span className="text-sm font-bold leading-6">
                      I have read and agree to the voice data agreement and the{' '}
                      <a className="text-accent underline" href="/terms" target="_blank">
                        Terms of Use
                      </a>
                      .
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
                      <Mic className="size-5" aria-hidden="true" />
                    )}
                    Start recording
                  </button>
                </section>
              )}

              {step === 'loading' && (
                <div className="mx-auto grid place-items-center gap-3 text-center">
                  <LoaderCircle className="size-8 animate-spin text-accent" aria-hidden="true" />
                  <p className="font-bold text-muted">Preparing your session...</p>
                </div>
              )}

              {step === 'training' && (
                <section className="mx-auto grid w-full max-w-2xl gap-6">
                  {isLoadingNext || !prompt ? (
                    <div className="mx-auto grid place-items-center gap-3 text-center">
                      <LoaderCircle className="size-8 animate-spin text-accent" aria-hidden="true" />
                      <p className="font-bold text-muted">Loading your next prompt...</p>
                    </div>
                  ) : (
                    <>
                      <div className="mx-auto grid w-full max-w-md justify-items-center gap-2 text-center">
                        <span className="inline-flex items-center rounded-full bg-accent-soft px-3 py-1 text-xs font-extrabold text-accent">
                          {prompt.domain}
                        </span>
                        <p className="text-lg font-extrabold leading-relaxed">{prompt.promptText}</p>
                        <p className="text-xs font-bold text-muted">
                          Record in {prompt.dialectTag} -- {minDurationSeconds}-{maxDurationSeconds}s
                        </p>
                      </div>

                      <div className="relative mx-auto grid size-[248px] place-items-center md:size-[288px]">
                        <svg
                          aria-hidden="true"
                          className="absolute inset-0 size-full -rotate-90"
                          viewBox="0 0 240 240"
                        >
                          <circle
                            cx="120"
                            cy="120"
                            fill="none"
                            r={RING_RADIUS}
                            stroke="var(--line)"
                            strokeWidth="12"
                          />
                          <circle
                            cx="120"
                            cy="120"
                            fill="none"
                            r={RING_RADIUS}
                            stroke={ringColor}
                            strokeDasharray={RING_CIRCUMFERENCE}
                            strokeDashoffset={RING_CIRCUMFERENCE * (1 - progress)}
                            strokeLinecap="round"
                            strokeWidth="12"
                            className="transition-[stroke,stroke-dashoffset] duration-100"
                          />
                        </svg>
                        <button
                          aria-label={recorderButtonLabel(recorderState)}
                          className="relative z-[1] grid size-36 place-items-center rounded-full bg-accent text-white shadow-[0_14px_40px_rgba(126,34,206,0.3)] transition-transform active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 md:size-40"
                          disabled={
                            recorderState === 'submitting' ||
                            recorderState === 'submitted' ||
                            stopDisabledByMinGate
                          }
                          onClick={() => {
                            if (recorderState === 'ready') void startRecording();
                            else if (recorderState === 'recording') stopRecording();
                            else togglePlayback();
                          }}
                          type="button"
                        >
                          {recorderState === 'recording' ? (
                            <Square className="size-12 fill-current" aria-hidden="true" />
                          ) : recorderState === 'playing' ? (
                            <Pause className="size-12 fill-current" aria-hidden="true" />
                          ) : recorderState === 'recorded' || recorderState === 'paused' ? (
                            <Play className="ml-1 size-12 fill-current" aria-hidden="true" />
                          ) : recorderState === 'submitting' ? (
                            <LoaderCircle className="size-12 animate-spin" aria-hidden="true" />
                          ) : recorderState === 'submitted' ? (
                            <Check className="size-14" aria-hidden="true" />
                          ) : (
                            <Mic className="size-14" aria-hidden="true" />
                          )}
                        </button>
                      </div>

                      <div className="flex items-center justify-center gap-3 text-sm font-bold">
                        <span>
                          {formatDuration(elapsedMs)} / {formatDuration(maxDurationMs)}
                        </span>
                        <span aria-hidden="true" className="text-line">
                          |
                        </span>
                        <span className="inline-flex items-center gap-2">
                          <span
                            className="size-2.5 rounded-full"
                            style={{ backgroundColor: ringColor }}
                          />
                          {noiseLabel(noiseRating)}
                        </span>
                      </div>

                      {stopDisabledByMinGate && (
                        <p className="text-center text-sm font-bold text-muted">
                          Keep going -- {remainingUntilUnlockSeconds}s more to unlock Submit
                        </p>
                      )}

                      {audioUrl && (
                        <audio
                          onEnded={() => setRecorderState('recorded')}
                          ref={audioRef}
                          src={audioUrl}
                        />
                      )}
                      {error && (
                        <div className="grid justify-items-center gap-1">
                          <p className="text-sm font-bold text-danger" role="alert">
                            {error}
                          </p>
                          {error === MIC_PERMISSION_ERROR && (
                            <button
                              className="text-sm font-extrabold text-accent underline hover:no-underline"
                              onClick={() => void startRecording()}
                              type="button"
                            >
                              Click here to give permission
                            </button>
                          )}
                        </div>
                      )}

                      {(recorderState === 'recorded' ||
                        recorderState === 'paused' ||
                        recorderState === 'playing') && (
                        <div className="flex flex-wrap items-center justify-center gap-3">
                          <button
                            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line bg-surface px-5 font-extrabold hover:bg-surface-muted"
                            onClick={clearRecording}
                            type="button"
                          >
                            <Trash2 className="size-4" aria-hidden="true" />
                            Delete
                          </button>
                          <button
                            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-accent px-5 font-extrabold text-white hover:bg-accent-dark"
                            onClick={() => void saveRecording()}
                            type="button"
                          >
                            <Send className="size-4" aria-hidden="true" />
                            Submit
                          </button>
                        </div>
                      )}

                      {recorderState === 'submitted' && (
                        <div className="mx-auto grid w-full max-w-md gap-4 rounded-lg border border-line bg-surface p-5">
                          <div className="flex items-center justify-center gap-2 font-black text-emerald-700 dark:text-emerald-300">
                            <Check className="size-5" aria-hidden="true" />
                            Recording submitted
                          </div>
                          <button
                            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-accent px-5 font-extrabold text-white hover:bg-accent-dark"
                            onClick={() => void nextPrompt()}
                            type="button"
                          >
                            Next prompt <ArrowRight className="size-4" aria-hidden="true" />
                          </button>
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
                  <h2 className="text-2xl font-black">No prompts available right now</h2>
                  <p className="leading-relaxed text-muted">
                    The domain conversation task is temporarily unavailable. Check back later.
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

function preferredMimeType(): string | undefined {
  return ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'].find((type) =>
    MediaRecorder.isTypeSupported(type),
  );
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

'use client';

import * as RadixDialog from '@radix-ui/react-dialog';
import * as RadixPopover from '@radix-ui/react-popover';
import {
  ArrowRight,
  Check,
  Clock3,
  Keyboard,
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
import { ActionButton } from '@/components/ui/ActionButton';
import { usePortalContainer } from '@/components/ui/PortalContainer';
import { notifyFullScreenOverlay } from '@/lib/recording-signal';
import { QracDialog } from '@/components/trainer/QracDialog';
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

// Same "sessions have no server-side TTL" reasoning as required courses
// (see extractRequiredCourses below), but the QRAC checklist is a periodic
// re-affirmation the trainer resolves in-place, right here -- unlike
// required courses (owned by the parent, since it can also gate other
// entry points like dictation), QracDialog is rendered inside this
// component and never closes this outer dialog, just overlays it.
function extractQracRequired(err: unknown): boolean {
  const data = (err as { data?: ApiErrorShape } | undefined)?.data;
  return !!data?.qracRequired;
}

const MIC_PERMISSION_ERROR = 'Microphone permission is required to record.';
const DEFAULT_SECONDS_PER_WORD = 5;
const DEFAULT_MAX_RECORDING_MS = 180_000;
const RING_RADIUS = 104;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
// Matches SessionActivityTracker's own throttle so this dialog's heartbeat
// and the global DOM-event heartbeat stay on the same cadence.
const HEARTBEAT_MIN_INTERVAL_MS = 2 * 60_000;

/** Counts words in the assignment's prompt text -- 1-word dictionary entries today, but a general split so a multi-word phrase scales the timeout the same way. */
function countPromptWords(promptText: string | null | undefined): number {
  if (!promptText) return 1;
  const words = promptText.trim().split(/\s+/).filter(Boolean);
  return Math.max(1, words.length);
}

// Distinct, stable message the backend returns when the content pool is
// empty (see WordsService.nextAssignment's NO_WORDS_AVAILABLE) -- matched
// here to show a "check back later" empty state instead of a generic error
// banner. There is no per-word usage limit; this only ever means the pool
// itself has zero rows right now.
function isNoWordsAvailable(err: unknown): boolean {
  const message = (err as { data?: ApiErrorShape } | undefined)?.data?.message;
  const text = Array.isArray(message) ? message.join(' ') : message;
  return text === 'NO_WORDS_AVAILABLE';
}

// A course can be marked required (or a session can simply outlive the
// moment startSession first checked -- sessions have no server-side TTL)
// after this dialog was already open, so nextAssignment re-checks on every
// call and 403s with this shape when it finds newly-incomplete required
// courses -- see WordsService.nextAssignment.
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

type FlowStep = 'terms' | 'loading' | 'training' | 'unavailable';
type RecorderState =
  'ready' | 'recording' | 'recorded' | 'playing' | 'paused' | 'submitting' | 'submitted';

export function WordTrainingDialog({
  open,
  onOpenChange,
  recordingTimeoutSeconds,
  recordingMaxTimeoutSeconds,
  onRequiredCourses,
  onInsufficientBalance,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Seconds allowed per word (not a flat round total) -- multiplied by the assignment's word count to get the round's countdown. */
  recordingTimeoutSeconds?: number;
  /** Absolute ceiling on the round's total countdown after the per-word multiplication. */
  recordingMaxTimeoutSeconds?: number;
  /**
   * Fires when the server finds newly-incomplete required courses mid-
   * session (nextAssignment re-checks on every call, not just at
   * startSession) -- lets the parent close this dialog and reuse its own
   * RequiredCoursesDialog instead of duplicating that UI here.
   */
  onRequiredCourses?: (courses: { id: string; slug: string; title: string }[]) => void;
  onInsufficientBalance?: () => void;
}) {
  const portalContainer = usePortalContainer();
  const { status: authStatus, update: updateAuthSession } = useAuthSession();
  const lastHeartbeatAtRef = useRef(0);
  const [step, setStep] = useState<FlowStep>('terms');
  const [accepted, setAccepted] = useState(false);
  const [session, setSession] = useState<WordTrainingSession | null>(null);
  const [assignment, setAssignment] = useState<WordTrainingAssignment | null>(null);
  const [responseText, setResponseText] = useState('');
  const [recorderState, setRecorderState] = useState<RecorderState>('ready');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [noiseRating, setNoiseRating] = useState<RecordingNoiseRating>('QUIET');
  // Ambient (pre-recording) room-noise readout -- shown on the mic button's
  // own background while recorderState is 'ready', distinct from noiseRating
  // (which drives the ring during/after an actual recording). Uses more
  // sensitive thresholds (see classifyAmbientNoise) since its only job is to
  // warn the trainer about their environment before they commit to a take.
  const [ambientNoiseRating, setAmbientNoiseRating] = useState<RecordingNoiseRating>('QUIET');
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [score, setScore] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<{ text: string; source: 'community' | 'ai' }[]>(
    [],
  );
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [sourcePlaying, setSourcePlaying] = useState(false);
  const [qracOpen, setQracOpen] = useState(false);
  const [showLevelUp, setShowLevelUp] = useState(false);
  const submittingRef = useRef(false);
  // A Sentence-sourced assignment has wordId=null (see WordTrainingAssignment
  // -- WordsService.nextAssignment sets it explicitly for both a
  // Sentence-sourced ENGLISH_TO_DIALECT pick and a reverse-validation whose
  // source was itself a sentence). Typing a full-sentence transcript on top
  // of the recording would duplicate the exercise without adding scoring
  // value the recording doesn't already carry, so it's skipped for both
  // directions -- unlike a Word-sourced assignment, where the typed spelling
  // is required and independently scored/normalized.
  const isSentenceSourced = !!assignment && !assignment.wordId;

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
    recordingTimeoutSeconds &&
    Number.isFinite(recordingTimeoutSeconds) &&
    recordingTimeoutSeconds > 0
      ? recordingTimeoutSeconds
      : DEFAULT_SECONDS_PER_WORD;
  const maxTotalSeconds =
    recordingMaxTimeoutSeconds &&
    Number.isFinite(recordingMaxTimeoutSeconds) &&
    recordingMaxTimeoutSeconds > 0
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
  // true while streamRef holds an ambient-monitoring-only stream (opened
  // before the trainer clicks record); false once an actual recording is
  // underway. monitorSignal's read loop checks this each frame to decide
  // whether to update ambientNoiseRating (button background) or noiseRating
  // (ring) -- see startRecording, which flips this off and reuses the same
  // stream instead of requesting the mic a second time.
  const isAmbientModeRef = useRef(false);
  // Mirrors the `open` prop for startAmbientMonitoring's async permission
  // check below -- the callback has no dependency array access to a fresh
  // `open` value, and closing the dialog while getUserMedia is pending must
  // not leave an un-released stream behind.
  const openRef = useRef(open);
  openRef.current = open;

  const releaseMicrophone = useCallback(() => {
    if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current);
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    animationFrameRef.current = null;
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    void audioContextRef.current?.close();
    audioContextRef.current = null;
    isAmbientModeRef.current = false;
  }, []);

  const startAmbientMonitoring = useCallback(async () => {
    if (streamRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      // The dialog may have closed while this permission prompt was
      // pending -- releaseMicrophone() already ran with nothing to
      // release, so without this check the stream below would open and
      // never get torn down.
      if (!openRef.current || streamRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      isAmbientModeRef.current = true;
      setAmbientNoiseRating('QUIET');
      monitorSignal(stream);
    } catch {
      // Permission denied/unavailable -- silently skip ambient monitoring;
      // the trainer still sees the normal mic-permission error when they
      // actually try to record (startRecording's own getUserMedia call).
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    setAssignment(null);
    setResponseText('');
    setError(null);
    setSuggestions([]);
    setSuggestionsOpen(false);
    setKeyboardOpen(false);
    setSourcePlaying(false);
    setQracOpen(false);
    setShowLevelUp(false);
  }, [clearRecording, open, releaseMicrophone]);

  // Fires once, the exact call after a trainer's lifetime WordRecording
  // count crosses into a new phrase-escalation tier (see
  // WordsService.didJustReachTier) -- phraseTierJustReached is only ever
  // true on that single response, so this doesn't need to track "already
  // shown" state itself.
  useEffect(() => {
    if (assignment?.phraseTierJustReached) setShowLevelUp(true);
  }, [assignment]);

  // Tawk.to's chat bubble sits bottom-right, the same corner this dialog's
  // record button and audio controls occupy -- hide it for the whole
  // training session (not just the exact recording moment) so it can't
  // overlap or steal taps. See lib/recording-signal.ts for why this is a
  // pub/sub signal rather than a prop: TawkToWidget is mounted globally in
  // providers.tsx and has no reference to this dialog.
  useEffect(() => {
    notifyFullScreenOverlay(open);
    return () => notifyFullScreenOverlay(false);
  }, [open]);

  // Opens the mic as soon as the ready screen shows (assignment loaded,
  // nothing clicked yet) so the button background can live-monitor ambient
  // room noise before the trainer commits to a take -- see
  // startAmbientMonitoring. Only ever runs while recorderState is 'ready';
  // startRecording reuses this same stream rather than requesting the mic a
  // second time.
  useEffect(() => {
    if (step === 'training' && assignment && recorderState === 'ready') {
      void startAmbientMonitoring();
    }
  }, [step, assignment, recorderState, startAmbientMonitoring]);

  // SessionActivityTracker's idle-timeout heartbeat only fires on
  // mousemove/keydown/touchstart/scroll -- none of which a trainer produces
  // while sitting still recording an answer. Left uncorrected, a recording
  // that runs long enough (or that starts after the trainer had already
  // spent a few idle minutes reading the prompt) can cross
  // sessionIdleTimeoutMinutes entirely inside this dialog, and the next
  // 5-minute session poll in providers.tsx force-signs them out mid-flight
  // (see auth-options.ts's lastActiveAt check). Treat this dialog being
  // open at all as activity, on the same throttle, so a trainer actively
  // working through a round never gets timed out from under them.
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

  useEffect(() => {
    if (
      !assignment ||
      assignment.direction !== 'ENGLISH_TO_DIALECT' ||
      !assignment.dialectTag ||
      !assignment.wordId
    ) {
      setSuggestions([]);
      return;
    }
    const wordId = assignment.wordId;
    const dialectTag = assignment.dialectTag;
    const query = responseText.trim();
    if (suggestionsDebounceRef.current !== null)
      window.clearTimeout(suggestionsDebounceRef.current);

    function fetchSuggestions() {
      loadSuggestions({ wordId, dialectTag, query })
        .unwrap()
        .then((result) => {
          setSuggestions(result.suggestions);
          // The very first load (before the trainer has typed anything) has
          // nothing to react to yet -- surface it proactively instead of
          // waiting for a focus/keystroke that may never come if they just
          // pick straight from the list. Once they're actively typing,
          // onChange already opens it explicitly, so this only fires once.
          if (!query && result.suggestions.length > 0) setSuggestionsOpen(true);
        })
        .catch(() => setSuggestions([]));
    }

    // No debounce for the query-less initial load (nothing to wait for --
    // this fires once per assignment, not per keystroke). Real keystrokes
    // still debounce briefly so suggestions update live as the trainer
    // types without spamming a request per character.
    if (!query) {
      fetchSuggestions();
    } else {
      suggestionsDebounceRef.current = window.setTimeout(fetchSuggestions, 150);
    }
    return () => {
      if (suggestionsDebounceRef.current !== null)
        window.clearTimeout(suggestionsDebounceRef.current);
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
        if (extractQracRequired(err)) {
          // Session-start QRAC keeps the just-created session open. The
          // affirmation overlay resumes this exact first-assignment request.
          setQracOpen(true);
          return;
        }
        void endSession(created.sessionId);
        setSession(null);
        if (isNoWordsAvailable(err)) {
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
    setSourcePlaying(false);
    try {
      setAssignment(await loadNext(session.sessionId, false).unwrap());
      // Covers the session-start QRAC path: beginSession() sets step to
      // 'loading' before the first loadNext call, and when that call 403s
      // for QRAC, handleQracSigned() re-invokes THIS function to retry it.
      // Without this, step stays stuck on 'loading' forever even though
      // the assignment fetch above just succeeded -- the 'training' section
      // below never renders because step === 'loading' still matches first.
      // A no-op when already 'training' (the normal next-word case).
      setStep('training');
    } catch (err) {
      if (isNoWordsAvailable(err)) {
        setStep('unavailable');
        return;
      }
      if (extractQracRequired(err)) {
        // Deliberately don't touch `session`/`step`/onOpenChange here --
        // QracDialog renders as an overlay on top of this same dialog and
        // resolves the check in place; signing retries this exact call.
        setQracOpen(true);
        return;
      }
      const requiredCourses = extractRequiredCourses(err);
      if (requiredCourses && onRequiredCourses) {
        void endSession(session.sessionId);
        setSession(null);
        onOpenChange(false);
        onRequiredCourses(requiredCourses);
        return;
      }
      if (hasInsufficientBalance(err) && onInsufficientBalance) {
        void endSession(session.sessionId);
        setSession(null);
        onOpenChange(false);
        onInsufficientBalance();
        return;
      }
      setError(normalizeErrorMessage(err, 'Unable to load the next word.'));
    }
  }

  const canSkipAssignment =
    !!assignment &&
    !isLoadingNext &&
    recorderState !== 'recording' &&
    recorderState !== 'submitting' &&
    recorderState !== 'submitted';

  async function startRecording() {
    if (!assignment) return;
    setError(null);
    try {
      // Reuse the stream ambient monitoring already opened (see
      // startAmbientMonitoring) instead of requesting the mic a second
      // time -- avoids a duplicate permission prompt and a brief gap where
      // two streams would be open at once. Falls back to requesting fresh
      // if ambient monitoring never got permission (e.g. it was denied,
      // then granted on this explicit user-initiated attempt).
      const stream =
        streamRef.current ??
        (await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        }));
      streamRef.current = stream;
      isAmbientModeRef.current = false;
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
        const duration = Math.min(maxRecordingMs, Math.max(1, Date.now() - startedAtRef.current));
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

      // Only (re)start the analyser loop if ambient monitoring wasn't
      // already running one on this same stream.
      if (!animationFrameRef.current) monitorSignal(stream);
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
      const now = performance.now();
      if (isAmbientModeRef.current) {
        // Pre-recording: no averaging/accumulation (nothing is being
        // scored yet), just a live per-frame readout on the button
        // background at the more sensitive ambient thresholds.
        if (now - lastNoiseRenderRef.current >= 160) {
          setAmbientNoiseRating(classifyAmbientNoise(rms));
          lastNoiseRenderRef.current = now;
        }
      } else {
        noiseTotalRef.current += rms;
        noiseSamplesRef.current += 1;
        if (now - lastNoiseRenderRef.current >= 160) {
          setNoiseRating(classifyNoise(rms));
          lastNoiseRenderRef.current = now;
        }
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
    if (!assignment || !audioBlob || (!isSentenceSourced && !responseText.trim())) {
      setError(
        isSentenceSourced
          ? 'Record the sentence before submitting.'
          : 'Enter the spelling and record the word before submitting.',
      );
      return;
    }
    // A fast double-tap on mobile can fire this handler twice before React
    // re-renders the disabled/hidden submit button, racing two
    // createUpload+submit sequences for the same assignment -- the second
    // createUpload overwrites the assignment's uploadKey in the DB before
    // the first submit's audioKey reaches the backend, which then 403s with
    // "does not belong to this assignment". This ref-based guard closes
    // that same-tick race; the state-based disabled check below only
    // protects against subsequent renders.
    if (submittingRef.current) return;
    submittingRef.current = true;
    setError(null);
    setRecorderState('submitting');
    try {
      const uploadContentType = audioBlob.type.split(';')[0] || 'audio/webm';
      const upload = await createUpload({
        assignmentId: assignment.assignmentId,
        contentType: uploadContentType,
      }).unwrap();
      const uploaded = await fetch(upload.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': uploadContentType },
        body: audioBlob,
      });
      if (!uploaded.ok) throw new Error('The audio upload failed. Please try again.');

      const result = await submitRecording({
        assignmentId: assignment.assignmentId,
        ...(isSentenceSourced ? {} : { responseText: responseText.trim() }),
        bucket: upload.bucket,
        audioKey: upload.key,
        durationMs: Math.max(1, Math.round(elapsedMs)),
        noiseRating,
      }).unwrap();
      setScore(result.validationScore);
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

  const progress = Math.min(1, elapsedMs / maxRecordingMs);
  const ringColor = noiseColor(noiseRating);
  // Button background lives entirely in the 'ready' state (ambient
  // monitoring before any click); every other state keeps the normal solid
  // accent-purple, with the ring (ringColor above) carrying noise feedback
  // once a take is actually being recorded.
  const micButtonBackground =
    recorderState === 'ready' ? noiseColor(ambientNoiseRating) : undefined;

  async function handleQracSigned() {
    setQracOpen(false);
    void nextWord();
  }

  async function handleQracEndSession() {
    setQracOpen(false);
    void closeDialog();
  }

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
            aria-describedby="word-training-description"
            className="fixed inset-0 z-50 overflow-y-auto bg-bg text-ink focus:outline-none data-[state=open]:animate-[fadeIn_150ms_ease-out]"
            onEscapeKeyDown={(event) => {
              if (recorderState === 'recording') event.preventDefault();
            }}
            onOpenAutoFocus={(event) => event.preventDefault()}
          >
            <header className="sticky top-0 z-10 border-b border-line bg-surface/95 backdrop-blur">
              <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-4 md:px-6">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="min-w-0">
                    <RadixDialog.Title className="truncate text-lg font-black">
                      Word training
                    </RadixDialog.Title>
                    <RadixDialog.Description
                      className="truncate text-xs font-semibold text-muted"
                      id="word-training-description"
                    >
                      {session ? `${session.dialectName} session` : 'Voice contribution session'}
                    </RadixDialog.Description>
                  </div>
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
                      use your recordings, typed translations, and derived data to develop,
                      evaluate, and improve speech and artificial intelligence systems.
                    </p>
                    <p>
                      This permission is worldwide, perpetual, and may include sharing de-identified
                      training data with approved research or commercial partners. Your account
                      identity will not be included in licensed audio datasets.
                    </p>
                  </div>
                  <label
                    className="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-surface-muted p-4"
                    htmlFor="voice-consent"
                  >
                    <input
                      checked={accepted}
                      className="mt-0.5 size-5 accent-accent"
                      id="voice-consent"
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
                    {isStarting ? 'Starting session' : 'Agree and start'}
                  </button>
                </section>
              )}

              {step === 'loading' && <LoadingState label="Preparing your first word" />}

              {step === 'training' && (
                <section className="mx-auto grid w-full max-w-3xl gap-6 text-center">
                  {showLevelUp && (
                    <div
                      className="mx-auto flex w-full max-w-xl items-center justify-between gap-4 rounded-lg border-2 border-accent bg-accent-soft p-4 text-left"
                      role="status"
                    >
                      <p className="text-sm font-bold text-accent">
                        🎉 You&apos;ve unlocked phrase recording! You&apos;ll now record short
                        phrases instead of single words.
                      </p>
                      <button
                        aria-label="Dismiss"
                        className="shrink-0 rounded-lg p-1.5 text-accent hover:bg-accent/10"
                        onClick={() => setShowLevelUp(false)}
                        type="button"
                      >
                        <X aria-hidden="true" className="size-4" />
                      </button>
                    </div>
                  )}
                  {!assignment ? (
                    <LoadingState label="Generating next word" />
                  ) : (
                    <>
                      <div>
                        <div className="flex flex-wrap items-center justify-center gap-3">
                          <span className="inline-flex rounded-full bg-accent-soft px-3 py-1 text-xs font-extrabold text-accent">
                            {assignment.sourceLanguage} to {assignment.responseLanguage}
                          </span>
                          <SkipAssignmentButton
                            disabled={!canSkipAssignment}
                            loading={isLoadingNext}
                            onClick={() => void nextWord()}
                          />
                        </div>
                        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-muted px-2.5 py-1 text-xs font-extrabold text-muted">
                            <span aria-hidden="true">
                              {assignment.direction === 'DIALECT_TO_ENGLISH' ? '🔊' : '💬'}
                            </span>
                            {assignment.direction === 'DIALECT_TO_ENGLISH'
                              ? `Listen in ${assignment.sourceLanguage}`
                              : `Shown in ${assignment.sourceLanguage}`}
                          </span>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
                          <h2 className="break-words text-4xl font-black md:text-6xl">
                            {assignment.promptText}
                          </h2>
                          {assignment.sourceAudioUrl && (
                            <button
                              aria-label={
                                sourcePlaying ? 'Pause dialect recording' : 'Play dialect recording'
                              }
                              className="grid size-11 shrink-0 place-items-center rounded-full bg-accent text-white shadow-[0_8px_20px_rgba(126,34,206,0.3)] transition-transform hover:bg-accent-dark active:scale-95"
                              onClick={toggleSourcePlayback}
                              type="button"
                            >
                              {sourcePlaying ? (
                                <Pause className="size-5 fill-current" aria-hidden="true" />
                              ) : (
                                <Play className="ml-0.5 size-5 fill-current" aria-hidden="true" />
                              )}
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

                      {!isSentenceSourced && (
                        <div className="mx-auto grid w-full max-w-md gap-2 text-left">
                          <label
                            className="flex items-center gap-1.5 text-sm font-extrabold"
                            htmlFor="training-response"
                          >
                            <span className="grid size-5 shrink-0 place-items-center rounded-full bg-accent-soft text-[11px] font-black text-accent">
                              1
                            </span>
                            Type it in {assignment.responseLanguage}
                          </label>
                          <RadixPopover.Root
                            open={suggestionsOpen && suggestions.length > 0}
                            onOpenChange={setSuggestionsOpen}
                          >
                            <RadixPopover.Anchor asChild>
                              <div className="relative">
                                <input
                                  autoComplete="off"
                                  className="min-h-12 w-full rounded-lg border border-line bg-surface px-4 text-base font-bold outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft disabled:opacity-60"
                                  disabled={
                                    recorderState === 'submitting' || recorderState === 'submitted'
                                  }
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
                                    aria-label={
                                      keyboardOpen
                                        ? 'Hide dialect keyboard'
                                        : 'Show dialect keyboard'
                                    }
                                    aria-pressed={keyboardOpen}
                                    className={`absolute right-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-md transition-colors ${
                                      keyboardOpen
                                        ? 'bg-accent-soft text-accent'
                                        : 'text-muted hover:bg-surface-muted'
                                    }`}
                                    disabled={
                                      recorderState === 'submitting' ||
                                      recorderState === 'submitted'
                                    }
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
                                            suggestion.source === 'community'
                                              ? 'bg-emerald-100 text-emerald-700'
                                              : 'bg-accent-soft text-accent'
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
                              {assignment.dialectKeyboardLayout
                                .split(/\s+/)
                                .filter(Boolean)
                                .map((char) => (
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
                      )}

                      <div className="mx-auto grid w-full max-w-md justify-items-center gap-1 text-center">
                        <p className="flex items-center gap-1.5 text-sm font-extrabold">
                          {!isSentenceSourced && (
                            <span className="grid size-5 shrink-0 place-items-center rounded-full bg-accent-soft text-[11px] font-black text-accent">
                              2
                            </span>
                          )}
                          Say it in{' '}
                          {assignment.direction === 'DIALECT_TO_ENGLISH'
                            ? assignment.sourceLanguage
                            : assignment.responseLanguage}
                        </p>
                        {assignment.direction === 'DIALECT_TO_ENGLISH' && !isSentenceSourced && (
                          <p className="text-xs font-bold text-muted">
                            Your own {assignment.sourceLanguage} pronunciation of this word -- not
                            the English you typed above.
                          </p>
                        )}
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
                          className={`relative z-[1] grid size-36 place-items-center rounded-full text-white shadow-[0_14px_40px_rgba(126,34,206,0.3)] transition-[transform,background-color] duration-150 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 md:size-40 ${micButtonBackground ? '' : 'bg-accent'}`}
                          disabled={recorderState === 'submitting' || recorderState === 'submitted'}
                          onClick={() => {
                            if (recorderState === 'ready') void startRecording();
                            else if (recorderState === 'recording') stopRecording();
                            else togglePlayback();
                          }}
                          style={
                            micButtonBackground
                              ? { backgroundColor: micButtonBackground }
                              : undefined
                          }
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
                          {formatDuration(elapsedMs)} / {formatDuration(maxRecordingMs)}
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
                            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-accent px-5 font-extrabold text-white hover:bg-accent-dark disabled:opacity-45"
                            disabled={!isSentenceSourced && !responseText.trim()}
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
                          {score !== null && (
                            <p className="text-sm font-bold text-muted">
                              Validation match: {score === 1 ? 'Confirmed' : 'Needs review'}
                            </p>
                          )}
                          <button
                            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-accent px-5 font-extrabold text-white hover:bg-accent-dark"
                            onClick={() => void nextWord()}
                            type="button"
                          >
                            Next word <ArrowRight className="size-4" aria-hidden="true" />
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
                  <h2 className="text-2xl font-black">No words available right now</h2>
                  <p className="leading-relaxed text-muted">
                    The word dictionary is temporarily empty for your dialect. Check back later --
                    new words are added regularly.
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
        sessionId={session?.sessionId ?? null}
      />
    </>
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
      {loading ? (
        <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
      ) : (
        <ArrowRight className="size-3.5" aria-hidden="true" />
      )}
      {loading ? 'Loading' : 'Skip / next'}
    </button>
  );
}

function LoadingState({ label }: { label: string }) {
  return (
    <div className="grid place-items-center gap-3 py-16 text-center" role="status">
      <LoaderCircle className="size-8 animate-spin text-accent" aria-hidden="true" />
      <p className="font-extrabold">{label}</p>
    </div>
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

// Roughly half of classifyNoise's thresholds -- ambient monitoring's only
// job is to warn about room noise before the trainer commits to a take, so
// it should flag amber/red sooner than the during-recording classifier
// (which is tuned against echoCancellation/noiseSuppression already active
// on a committed take).
function classifyAmbientNoise(rms: number): RecordingNoiseRating {
  if (rms >= 0.11) return 'NOISY';
  if (rms >= 0.045) return 'FAIR';
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

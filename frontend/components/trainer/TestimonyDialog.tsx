'use client';

import * as RadixDialog from '@radix-ui/react-dialog';
import { Check, LoaderCircle, Mic, Pause, Play, Send, Square, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePortalContainer } from '@/components/ui/PortalContainer';
import { notifyFullScreenOverlay } from '@/lib/recording-signal';
import {
  normalizeErrorMessage,
  useCreateTestimonyUploadUrlMutation,
  useSubmitTestimonyMutation,
} from '@/store/api';

const RING_RADIUS = 104;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

type Step = 'choose' | 'video' | 'text' | 'submitted';
type RecorderState = 'ready' | 'recording' | 'recorded' | 'playing' | 'paused' | 'submitting';

function preferredVideoMimeType(): string | undefined {
  return [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4',
  ].find((type) => MediaRecorder.isTypeSupported(type));
}

function formatDuration(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function TestimonyDialog({
  open,
  onOpenChange,
  maxVideoSeconds,
  maxTextLength,
  onSubmitted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  maxVideoSeconds: number;
  maxTextLength: number;
  onSubmitted: () => void;
}) {
  const portalContainer = usePortalContainer();
  const [step, setStep] = useState<Step>('choose');
  const [recorderState, setRecorderState] = useState<RecorderState>('ready');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [videoBlob, setVideoBlob] = useState<Blob | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const submittingRef = useRef(false);

  const [createUpload] = useCreateTestimonyUploadUrlMutation();
  const [submitTestimony, { isLoading: isSubmittingText }] = useSubmitTestimonyMutation();

  const maxRecordingMs = maxVideoSeconds * 1000;

  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const playbackVideoRef = useRef<HTMLVideoElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const timerRef = useRef<number | null>(null);

  const releaseMedia = useCallback(() => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const clearRecording = useCallback(() => {
    playbackVideoRef.current?.pause();
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoBlob(null);
    setVideoUrl(null);
    setElapsedMs(0);
    setRecorderState('ready');
    chunksRef.current = [];
  }, [videoUrl]);

  useEffect(() => {
    if (open) return;
    releaseMedia();
    clearRecording();
    setStep('choose');
    setText('');
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    notifyFullScreenOverlay(open);
    return () => notifyFullScreenOverlay(false);
  }, [open]);

  useEffect(
    () => () => {
      releaseMedia();
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    },
    [releaseMedia, videoUrl],
  );

  async function startRecording() {
    setError(null);
    clearRecording();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;
      if (previewVideoRef.current) {
        previewVideoRef.current.srcObject = stream;
        void previewVideoRef.current.play();
      }
      const mimeType = preferredVideoMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const duration = Math.min(maxRecordingMs, Math.max(1, Date.now() - startedAtRef.current));
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'video/webm' });
        const url = URL.createObjectURL(blob);
        setElapsedMs(duration);
        setVideoBlob(blob);
        setVideoUrl(url);
        setRecorderState('recorded');
        releaseMedia();
      };

      startedAtRef.current = Date.now();
      setRecorderState('recording');
      recorder.start(250);
      timerRef.current = window.setInterval(() => {
        const elapsed = Math.min(maxRecordingMs, Date.now() - startedAtRef.current);
        setElapsedMs(elapsed);
        if (elapsed >= maxRecordingMs && recorder.state === 'recording') recorder.stop();
      }, 100);
    } catch (err) {
      releaseMedia();
      setError(
        err instanceof DOMException && err.name === 'NotAllowedError'
          ? 'Camera and microphone permission is required to record.'
          : 'The camera could not be started.',
      );
    }
  }

  function stopRecording() {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
  }

  function togglePlayback() {
    const video = playbackVideoRef.current;
    if (!video) return;
    if (recorderState === 'playing') {
      video.pause();
      setRecorderState('paused');
      return;
    }
    void video.play();
    setRecorderState('playing');
  }

  async function submitVideo() {
    if (!videoBlob) return;
    if (submittingRef.current) return;
    submittingRef.current = true;
    setError(null);
    setRecorderState('submitting');
    try {
      const uploadContentType = videoBlob.type.split(';')[0] || 'video/webm';
      const upload = await createUpload({ contentType: uploadContentType }).unwrap();
      const uploaded = await fetch(upload.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': uploadContentType },
        body: videoBlob,
      });
      if (!uploaded.ok) throw new Error('The video upload failed. Please try again.');

      await submitTestimony({
        kind: 'VIDEO',
        bucket: upload.bucket,
        videoKey: upload.key,
        durationMs: Math.max(1, Math.round(elapsedMs)),
      }).unwrap();
      setStep('submitted');
      onSubmitted();
    } catch (err) {
      setError(
        normalizeErrorMessage(
          err,
          err instanceof Error ? err.message : 'Unable to submit your testimony.',
        ),
      );
      setRecorderState('recorded');
    } finally {
      submittingRef.current = false;
    }
  }

  async function submitText(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    setError(null);
    try {
      await submitTestimony({ kind: 'TEXT', text: trimmed }).unwrap();
      setStep('submitted');
      onSubmitted();
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to submit your testimony.'));
    }
  }

  const progress = Math.min(1, elapsedMs / maxRecordingMs);

  return (
    <RadixDialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onOpenChange(false);
      }}
    >
      <RadixDialog.Portal container={portalContainer}>
        <RadixDialog.Overlay className="fixed inset-0 z-40 bg-black/65 data-[state=open]:animate-[fadeIn_150ms_ease-out]" />
        <RadixDialog.Content
          aria-describedby="testimony-description"
          className="fixed inset-0 z-50 overflow-y-auto bg-bg text-ink focus:outline-none data-[state=open]:animate-[fadeIn_150ms_ease-out]"
          onEscapeKeyDown={(event) => {
            if (recorderState === 'recording') event.preventDefault();
          }}
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <header className="sticky top-0 z-10 border-b border-line bg-surface/95 backdrop-blur">
            <div className="mx-auto flex h-16 w-full max-w-3xl items-center justify-between px-4 md:px-6">
              <div className="min-w-0">
                <RadixDialog.Title className="truncate text-lg font-black">
                  Give a testimony
                </RadixDialog.Title>
                <RadixDialog.Description
                  className="truncate text-xs font-semibold text-muted"
                  id="testimony-description"
                >
                  Share your experience -- help others discover Dialect Library.
                </RadixDialog.Description>
              </div>
              <button
                aria-label="Close"
                className="grid size-10 place-items-center rounded-lg border border-line bg-surface hover:bg-surface-muted"
                onClick={() => onOpenChange(false)}
                type="button"
              >
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>
          </header>

          <main className="mx-auto grid min-h-[calc(100dvh-4rem)] w-full max-w-3xl content-center px-4 py-8 md:px-6">
            {step === 'choose' && (
              <section className="mx-auto grid w-full max-w-md gap-4">
                <h2 className="text-2xl font-black">How would you like to share?</h2>
                <button
                  className="grid grid-cols-[auto_1fr] items-center gap-4 rounded-lg border-2 border-accent bg-surface p-5 text-left"
                  onClick={() => setStep('video')}
                  type="button"
                >
                  <span className="grid size-12 place-items-center rounded-lg bg-accent-soft text-accent">
                    <Mic className="size-6" aria-hidden="true" />
                  </span>
                  <span>
                    <span className="block text-lg font-black">Record a video</span>
                    <span className="mt-1 block text-sm text-muted">
                      Up to {maxVideoSeconds} seconds, on camera.
                    </span>
                  </span>
                </button>
                <button
                  className="grid grid-cols-[auto_1fr] items-center gap-4 rounded-lg border border-line bg-surface p-5 text-left hover:bg-surface-muted"
                  onClick={() => setStep('text')}
                  type="button"
                >
                  <span className="grid size-12 place-items-center rounded-lg bg-accent-soft text-accent">
                    <Send className="size-6" aria-hidden="true" />
                  </span>
                  <span>
                    <span className="block text-lg font-black">Write a short quote</span>
                    <span className="mt-1 block text-sm text-muted">
                      Up to {maxTextLength} characters.
                    </span>
                  </span>
                </button>
              </section>
            )}

            {step === 'video' && (
              <section className="mx-auto grid w-full max-w-md justify-items-center gap-6 text-center">
                <div className="relative mx-auto grid size-[248px] place-items-center overflow-hidden rounded-full bg-black md:size-[288px]">
                  {recorderState === 'ready' && (
                    <Mic className="size-14 text-white/60" aria-hidden="true" />
                  )}
                  <video
                    className={`absolute inset-0 size-full object-cover ${
                      recorderState === 'recording' ? '' : 'hidden'
                    }`}
                    muted
                    playsInline
                    ref={previewVideoRef}
                  />
                  {videoUrl && (
                    <video
                      className={`absolute inset-0 size-full object-cover ${
                        recorderState === 'recorded' ||
                        recorderState === 'playing' ||
                        recorderState === 'paused'
                          ? ''
                          : 'hidden'
                      }`}
                      onEnded={() => setRecorderState('recorded')}
                      onPause={() => recorderState === 'playing' && setRecorderState('paused')}
                      playsInline
                      ref={playbackVideoRef}
                      src={videoUrl}
                    />
                  )}
                  <svg
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 size-full -rotate-90"
                    viewBox="0 0 240 240"
                  >
                    <circle
                      cx="120"
                      cy="120"
                      fill="none"
                      r={RING_RADIUS}
                      stroke="var(--line)"
                      strokeWidth="8"
                    />
                    <circle
                      cx="120"
                      cy="120"
                      className="transition-[stroke-dashoffset] duration-100"
                      fill="none"
                      r={RING_RADIUS}
                      stroke="#7c3aed"
                      strokeDasharray={RING_CIRCUMFERENCE}
                      strokeDashoffset={RING_CIRCUMFERENCE * (1 - progress)}
                      strokeLinecap="round"
                      strokeWidth="8"
                    />
                  </svg>
                </div>

                <button
                  aria-label={
                    recorderState === 'recording'
                      ? 'Stop recording'
                      : recorderState === 'ready'
                        ? 'Start recording'
                        : 'Play recording'
                  }
                  className="grid size-16 place-items-center rounded-full bg-accent text-white shadow-[0_14px_40px_rgba(126,34,206,0.3)] transition-transform active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={recorderState === 'submitting'}
                  onClick={() => {
                    if (recorderState === 'ready') void startRecording();
                    else if (recorderState === 'recording') stopRecording();
                    else togglePlayback();
                  }}
                  type="button"
                >
                  {recorderState === 'recording' ? (
                    <Square className="size-7 fill-current" aria-hidden="true" />
                  ) : recorderState === 'playing' ? (
                    <Pause className="size-7 fill-current" aria-hidden="true" />
                  ) : recorderState === 'recorded' || recorderState === 'paused' ? (
                    <Play className="ml-0.5 size-7 fill-current" aria-hidden="true" />
                  ) : recorderState === 'submitting' ? (
                    <LoaderCircle className="size-7 animate-spin" aria-hidden="true" />
                  ) : (
                    <Mic className="size-7" aria-hidden="true" />
                  )}
                </button>

                <p className="text-sm font-bold">
                  {formatDuration(elapsedMs)} / {formatDuration(maxRecordingMs)}
                </p>

                {error && (
                  <p className="text-sm font-bold text-danger" role="alert">
                    {error}
                  </p>
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
                      Redo
                    </button>
                    <button
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-accent px-5 font-extrabold text-white hover:bg-accent-dark"
                      onClick={() => void submitVideo()}
                      type="button"
                    >
                      <Send className="size-4" aria-hidden="true" />
                      Submit
                    </button>
                  </div>
                )}
              </section>
            )}

            {step === 'text' && (
              <form className="mx-auto grid w-full max-w-md gap-4" onSubmit={submitText}>
                <h2 className="text-2xl font-black">Write your testimony</h2>
                <textarea
                  className="min-h-40 w-full resize-none rounded-lg border border-line bg-white p-4 text-ink dark:bg-surface-muted"
                  maxLength={maxTextLength}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Dialect Library helped me..."
                  value={text}
                />
                <p className="text-right text-xs font-bold text-muted">
                  {text.length} / {maxTextLength}
                </p>
                {error && (
                  <p className="text-sm font-bold text-danger" role="alert">
                    {error}
                  </p>
                )}
                <button
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-accent px-5 font-extrabold text-white hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={!text.trim() || isSubmittingText}
                  type="submit"
                >
                  {isSubmittingText ? (
                    <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Send className="size-4" aria-hidden="true" />
                  )}
                  Submit
                </button>
              </form>
            )}

            {step === 'submitted' && (
              <section className="mx-auto grid w-full max-w-md justify-items-center gap-4 text-center">
                <span className="grid size-16 place-items-center rounded-full bg-emerald-100 text-emerald-700">
                  <Check className="size-8" aria-hidden="true" />
                </span>
                <h2 className="text-2xl font-black">Thank you!</h2>
                <p className="text-sm text-muted">
                  Your testimony is being reviewed. You&apos;ll be rewarded once it&apos;s approved.
                </p>
                <button
                  className="inline-flex min-h-11 items-center justify-center rounded-lg border border-line bg-surface px-5 font-extrabold hover:bg-surface-muted"
                  onClick={() => onOpenChange(false)}
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
  );
}

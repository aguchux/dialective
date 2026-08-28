'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import * as RadixDialog from '@radix-ui/react-dialog';
import { ArrowLeft, ArrowRight, CheckCircle2, LoaderCircle, Pause, Play, X } from 'lucide-react';
import { BlogContent } from '@/components/blog/BlogContent';
import { usePortalContainer } from '@/components/ui/PortalContainer';
import { notifyFullScreenOverlay } from '@/lib/recording-signal';
import type { CourseSlide } from '@/store/api';

type PlaybackState = 'idle' | 'playing' | 'paused';

/**
 * Full-screen slide deck -- image + text + optional narration audio, linear
 * prev/next only (no swipe/loop, so plain index state beats a carousel
 * library). Desktop: text column sits on the left at 1/3 width while the
 * slide image sits on the right at 2/3 width. The text column scrolls
 * independently with the audio bar pinned under it. Mobile: image
 * runs edge-to-edge at the top, text scrolls below it, audio bar pins to the
 * viewport bottom. Renders through a Radix Dialog (not the shared
 * DialogContent, which is capped at 480px) so it gets focus-trap/Escape/
 * portal handling without the small-dialog chrome.
 */
export function CourseSlideViewer({
  slides,
  initialIndex = 0,
  alreadyCompleted = false,
  courseTitle,
  onSlideChange,
  onFinish,
  onClose,
  closeHref,
  dashboardHref = '/dashboard?view=home',
  showCompletionScreen = true,
}: {
  slides: CourseSlide[];
  initialIndex?: number;
  /** Skips straight to the completion screen instead of slide 0 -- a trainer reopening an already-finished course shouldn't be forced through it again. */
  alreadyCompleted?: boolean;
  /** Shown on the completion screen's thank-you copy; omitted (generic copy) when not provided, e.g. the public no-auth viewer. */
  courseTitle?: string;
  onSlideChange?: (index: number) => void;
  /** Fires once, when the trainer hits Finish on the last slide (not on every resume of an already-completed course -- see alreadyCompleted). */
  onFinish?: () => void;
  onClose?: () => void;
  /** Used when there's no onClose callback available (e.g. a server-rendered host page) -- navigates here instead. */
  closeHref?: string;
  /** Where the completion screen's "Go to Dashboard" button navigates. */
  dashboardHref?: string;
  /** False for the public, logged-out viewer -- no dashboard to return to, so the last slide's Finish button just closes the viewer instead of showing the completion screen. */
  showCompletionScreen?: boolean;
}) {
  const [index, setIndex] = useState(() => clampIndex(initialIndex, slides.length));
  const [showCompletion, setShowCompletion] = useState(alreadyCompleted);
  const [playback, setPlayback] = useState<PlaybackState>('idle');
  const [audioProgress, setAudioProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const container = usePortalContainer();
  const router = useRouter();

  function handleClose() {
    if (onClose) {
      onClose();
    } else if (closeHref) {
      router.push(closeHref);
    }
  }

  function handleFinish() {
    onFinish?.();
    if (showCompletionScreen) {
      setShowCompletion(true);
    } else {
      handleClose();
    }
  }

  function handleGoToDashboard() {
    if (onClose) {
      onClose();
    } else {
      router.push(dashboardHref);
    }
  }

  const slide = slides[index];
  const isFirst = index === 0;
  const isLast = index === slides.length - 1;

  // This viewer is always full-screen while mounted -- hides Tawk.to's
  // floating chat bubble for as long as it's open, same as
  // WordTrainingDialog does for the same bottom-right overlap. See
  // lib/recording-signal.ts.
  useEffect(() => {
    notifyFullScreenOverlay(true);
    return () => notifyFullScreenOverlay(false);
  }, []);

  // Stop narration from bleeding across slides, and reset the play button
  // back to idle for the newly-shown slide's (possibly absent) audio.
  useEffect(() => {
    audioRef.current?.pause();
    setPlayback('idle');
    setAudioProgress(0);
    onSlideChange?.(index);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  // Arrow-key navigation -- a full-screen deck reads as its own surface, so
  // left/right should move slides the same way Escape (handled by Radix)
  // closes it.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'ArrowRight') goTo(index + 1);
      if (event.key === 'ArrowLeft') goTo(index - 1);
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, slides.length]);

  function goTo(next: number) {
    setIndex(clampIndex(next, slides.length));
  }

  function togglePlayback() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playback === 'playing') {
      audio.pause();
      setPlayback('paused');
      return;
    }
    void audio.play();
    setPlayback('playing');
  }

  const progressPercent = useMemo(
    () => Math.min(100, Math.max(0, audioProgress * 100)),
    [audioProgress],
  );

  if (!slide) return null;

  if (showCompletion) {
    return (
      <RadixDialog.Root defaultOpen onOpenChange={(open) => !open && handleClose()}>
        <RadixDialog.Portal container={container}>
          <RadixDialog.Overlay className="fixed inset-0 z-[950] bg-black" />
          <RadixDialog.Content
            className="fixed inset-0 z-[960] flex flex-col items-center justify-center overflow-y-auto bg-black p-6 text-center text-white focus:outline-none"
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            <RadixDialog.Title className="sr-only">Course complete</RadixDialog.Title>
            <RadixDialog.Close
              aria-label="Close"
              className="fixed right-4 top-4 z-20 grid size-9 place-items-center rounded-full bg-white/10 text-white backdrop-blur-sm transition-colors hover:bg-white/20"
            >
              <X className="size-5" aria-hidden="true" />
            </RadixDialog.Close>
            <div className="grid max-w-md gap-5 place-items-center">
              <CheckCircle2 className="size-16 text-emerald-400" aria-hidden="true" />
              <div className="grid gap-2">
                <h2 className="text-2xl font-black">Course complete!</h2>
                <p className="leading-relaxed text-white/70">
                  {courseTitle
                    ? `Thank you for completing "${courseTitle}".`
                    : 'Thank you for completing this course.'}{' '}
                  Any completion reward has already been credited to your DL balance.
                </p>
              </div>
              <button
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-accent px-6 font-extrabold text-white transition-colors hover:bg-accent-dark"
                onClick={handleGoToDashboard}
                type="button"
              >
                Go to Dashboard
              </button>
            </div>
          </RadixDialog.Content>
        </RadixDialog.Portal>
      </RadixDialog.Root>
    );
  }

  return (
    <RadixDialog.Root defaultOpen onOpenChange={(open) => !open && handleClose()}>
      <RadixDialog.Portal container={container}>
        <RadixDialog.Overlay className="fixed inset-0 z-[950] bg-black" />
        <RadixDialog.Content
          className="fixed inset-0 z-[960] flex flex-col overflow-hidden bg-black text-white focus:outline-none md:flex-row"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <RadixDialog.Title className="sr-only">{`Slide ${index + 1} of ${slides.length}`}</RadixDialog.Title>

          {/* Image: edge-to-edge at top on mobile, right-side 2/3 column on desktop. */}
          <div className="relative order-1 w-full shrink-0 bg-black md:order-2 md:h-full md:w-2/3">
            {slide.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt={slide.imageAlt || ''}
                className="aspect-[4/3] w-full object-contain md:h-full md:w-full md:object-contain"
                src={slide.imageUrl}
              />
            ) : (
              <div className="grid aspect-[4/3] w-full place-items-center bg-[#111] text-sm text-white/50 md:h-full">
                No image for this slide
              </div>
            )}

            <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-3 bg-gradient-to-b from-black/70 to-transparent p-3 md:p-4">
              <span className="rounded-full bg-black/50 px-3 py-1 text-xs font-bold backdrop-blur-sm">
                {index + 1} / {slides.length}
              </span>
              <RadixDialog.Close
                aria-label="Close"
                className="grid size-9 place-items-center rounded-full bg-black/50 text-white backdrop-blur-sm transition-colors hover:bg-black/70"
              >
                <X className="size-5" aria-hidden="true" />
              </RadixDialog.Close>
            </div>

            {/* Desktop-only prev/next -- overlaid on the image column so the text column stays purely for reading + audio. */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 hidden items-center justify-between p-4 md:flex">
              <button
                className="pointer-events-auto inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-black/50 px-5 font-extrabold text-white backdrop-blur-sm transition-colors hover:bg-black/70 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={isFirst}
                onClick={() => goTo(index - 1)}
                type="button"
              >
                <ArrowLeft className="size-4" aria-hidden="true" /> Previous
              </button>
              <button
                className="pointer-events-auto inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-accent px-5 font-extrabold text-white transition-colors hover:bg-accent-dark"
                onClick={() => (isLast ? handleFinish() : goTo(index + 1))}
                type="button"
              >
                {isLast ? 'Finish' : 'Next'} <ArrowRight className="size-4" aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* Text column: independently scrollable. On mobile, prev/next + audio
              stack together in one fixed bottom strip (in that order) so they
              never overlap the scrolling text; on desktop only the audio bar
              is pinned, under the left text column, since prev/next live over
              the image column instead. */}
          <div className="order-2 flex min-h-0 flex-1 flex-col bg-white text-ink md:order-1 md:w-1/3 md:flex-none">
            <div
              className={`min-h-0 flex-1 overflow-y-auto p-5 md:p-6 ${slide.audioUrl ? 'pb-32 md:pb-6' : 'pb-20 md:pb-6'}`}
            >
              <div className="blog-prose text-base leading-relaxed">
                <BlogContent blocks={slide.text.blocks} />
              </div>
            </div>

            <div className="fixed inset-x-0 bottom-0 z-10 bg-white md:static md:z-auto">
              {/* Mobile-only prev/next -- desktop's equivalent controls are overlaid on the image column. */}
              <div className="flex items-center justify-between gap-3 border-t border-line p-3 md:hidden">
                <button
                  className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg border border-line bg-surface font-extrabold text-ink hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-45"
                  disabled={isFirst}
                  onClick={() => goTo(index - 1)}
                  type="button"
                >
                  <ArrowLeft className="size-4" aria-hidden="true" /> Previous
                </button>
                <button
                  className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-accent font-extrabold text-white hover:bg-accent-dark"
                  onClick={() => (isLast ? handleFinish() : goTo(index + 1))}
                  type="button"
                >
                  {isLast ? 'Finish' : 'Next'} <ArrowRight className="size-4" aria-hidden="true" />
                </button>
              </div>

              {slide.audioUrl && (
                <div className="flex items-center gap-3 border-t border-line p-3">
                  <button
                    aria-label={playback === 'playing' ? 'Pause narration' : 'Play narration'}
                    className="grid size-11 shrink-0 place-items-center rounded-full bg-accent text-white hover:bg-accent-dark"
                    onClick={togglePlayback}
                    type="button"
                  >
                    {playback === 'playing' ? (
                      <Pause className="size-5 fill-current" aria-hidden="true" />
                    ) : (
                      <Play className="ml-0.5 size-5 fill-current" aria-hidden="true" />
                    )}
                  </button>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
                    <div
                      className="h-full rounded-full bg-accent transition-[width]"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                  <audio
                    onEnded={() => setPlayback('idle')}
                    onTimeUpdate={(event) => {
                      const audio = event.currentTarget;
                      if (audio.duration) setAudioProgress(audio.currentTime / audio.duration);
                    }}
                    ref={audioRef}
                    src={slide.audioUrl}
                  />
                </div>
              )}
            </div>
          </div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

export function CourseSlideViewerLoading() {
  return (
    <div className="grid place-items-center gap-3 py-16 text-center" role="status">
      <LoaderCircle className="size-8 animate-spin text-accent" aria-hidden="true" />
      <p className="font-extrabold">Loading course</p>
    </div>
  );
}

function clampIndex(index: number, length: number): number {
  if (length === 0) return 0;
  return Math.min(Math.max(0, index), length - 1);
}

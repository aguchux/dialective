'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, LoaderCircle, Pause, Play } from 'lucide-react';
import type { CourseSlide } from '@/store/api';

type PlaybackState = 'idle' | 'playing' | 'paused';

/**
 * Linear prev/next slide deck -- image + text + optional narration audio.
 * No carousel library: navigation is strictly sequential (no swipe/loop), so
 * plain index state is simpler than pulling in a dependency for it.
 */
export function CourseSlideViewer({
  slides,
  initialIndex = 0,
  onSlideChange,
}: {
  slides: CourseSlide[];
  initialIndex?: number;
  onSlideChange?: (index: number) => void;
}) {
  const [index, setIndex] = useState(() => clampIndex(initialIndex, slides.length));
  const [playback, setPlayback] = useState<PlaybackState>('idle');
  const [audioProgress, setAudioProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const slide = slides[index];
  const isFirst = index === 0;
  const isLast = index === slides.length - 1;

  // Stop narration from bleeding across slides, and reset the play button
  // back to idle for the newly-shown slide's (possibly absent) audio.
  useEffect(() => {
    audioRef.current?.pause();
    setPlayback('idle');
    setAudioProgress(0);
    onSlideChange?.(index);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

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

  const progressPercent = useMemo(() => Math.min(100, Math.max(0, audioProgress * 100)), [audioProgress]);

  if (!slide) return null;

  return (
    <div className="grid gap-6">
      <div className="grid gap-1 text-center text-sm font-bold text-muted">
        Slide {index + 1} of {slides.length}
      </div>

      <div className="mx-auto grid w-full max-w-2xl gap-5 rounded-lg border border-line bg-white p-5 md:p-7">
        {slide.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt={slide.imageAlt || ''}
            className="aspect-video w-full rounded-lg border border-line object-cover"
            src={slide.imageUrl}
          />
        ) : (
          <div className="grid aspect-video w-full place-items-center rounded-lg border border-dashed border-line bg-surface-muted text-sm text-muted">
            No image for this slide
          </div>
        )}

        <p className="whitespace-pre-wrap text-lg leading-relaxed text-ink">{slide.text}</p>

        {slide.audioUrl && (
          <div className="flex items-center gap-3 rounded-lg border border-line bg-surface p-3">
            <button
              aria-label={playback === 'playing' ? 'Pause narration' : 'Play narration'}
              className="grid size-11 shrink-0 place-items-center rounded-full bg-accent text-white hover:bg-accent-dark"
              onClick={togglePlayback}
              type="button"
            >
              {playback === 'playing' ? <Pause className="size-5 fill-current" aria-hidden="true" /> : <Play className="ml-0.5 size-5 fill-current" aria-hidden="true" />}
            </button>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
              <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${progressPercent}%` }} />
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

      <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3">
        <button
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line bg-surface px-5 font-extrabold hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-45"
          disabled={isFirst}
          onClick={() => goTo(index - 1)}
          type="button"
        >
          <ArrowLeft className="size-4" aria-hidden="true" /> Previous
        </button>
        <button
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-accent px-5 font-extrabold text-white hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-45"
          disabled={isLast}
          onClick={() => goTo(index + 1)}
          type="button"
        >
          Next <ArrowRight className="size-4" aria-hidden="true" />
        </button>
      </div>
    </div>
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

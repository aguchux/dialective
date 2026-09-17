'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Quote } from 'lucide-react';
import type { LandingTestimonial } from './TestimonialsCarousel';

/**
 * Ambient testimonial bubbles: one quote at a time drifts up from the bottom
 * of the viewport and dissolves in the upper third.
 *
 * Deliberately lightweight, because this runs on the marketing landing page:
 * - ONE bubble on screen at a time, not a stream. The admin interval is the
 *   gap between a bubble leaving and the next arriving.
 * - Animation is pure CSS (transform + opacity only, both compositor-driven),
 *   so there is no per-frame JS and no layout thrash. React only swaps which
 *   testimonial is mounted.
 * - pointer-events-none throughout, so it can never intercept a click on the
 *   real page beneath it.
 *
 * Respects prefers-reduced-motion by rendering nothing at all: an element that
 * drifts across the screen has no meaningful reduced-motion equivalent, and
 * the same testimonials are already on the page in TestimonialsCarousel, so
 * nothing is lost for those users.
 */

const RISE_DURATION_MS = 14_000;
const MIN_INTERVAL_S = 3;
const MAX_INTERVAL_S = 120;

// Kept away from the horizontal centre so a bubble doesn't sit on top of the
// hero's headline while it rises past it.
const LANES = [6, 16, 72, 84] as const;

function excerpt(testimonial: LandingTestimonial): string | null {
  const text = testimonial.text?.trim();
  if (!text) return null;
  return text.length > 120 ? `${text.slice(0, 117).trimEnd()}...` : text;
}

function attribution(testimonial: LandingTestimonial): string {
  const name = testimonial.trainerFirstName ?? 'A trainer';
  return testimonial.dialectName ? `${name} · ${testimonial.dialectName}` : name;
}

export function TestimonialBubbles({
  testimonials,
  intervalSeconds,
}: {
  testimonials: LandingTestimonial[];
  intervalSeconds: number;
}) {
  // VIDEO testimonies have no text to show, so they can't be bubbles. Filtering
  // here rather than at the fetch keeps the carousel's data untouched.
  const quotes = useMemo(() => testimonials.filter((t) => excerpt(t) !== null), [testimonials]);

  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(true);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setReducedMotion(query.matches);
    apply();
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, []);

  const gapMs = Math.min(Math.max(intervalSeconds, MIN_INTERVAL_S), MAX_INTERVAL_S) * 1000;

  useEffect(() => {
    if (reducedMotion || quotes.length === 0) return;

    let cancelled = false;
    const schedule = (fn: () => void, ms: number) => {
      const id = setTimeout(() => {
        if (!cancelled) fn();
      }, ms);
      timers.current.push(id);
    };

    const cycle = () => {
      setVisible(true);
      // Unmount after the rise finishes, then wait the admin-configured gap
      // before the next one. Interval is measured between bubbles, so a long
      // interval reads as "occasional" rather than overlapping.
      schedule(() => {
        setVisible(false);
        schedule(() => {
          setIndex((i) => (i + 1) % quotes.length);
          cycle();
        }, gapMs);
      }, RISE_DURATION_MS);
    };

    // Don't open with a bubble already mid-flight on first paint.
    schedule(cycle, gapMs);

    return () => {
      cancelled = true;
      timers.current.forEach(clearTimeout);
      timers.current = [];
      setVisible(false);
    };
  }, [reducedMotion, quotes.length, gapMs]);

  if (reducedMotion || quotes.length === 0) return null;

  const testimonial = quotes[index % quotes.length];
  const body = excerpt(testimonial);
  if (!body) return null;

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-20 overflow-hidden">
      {visible && (
        <figure
          className="testimonial-bubble pointer-events-none absolute bottom-0 w-[15rem] max-w-[72vw] rounded-2xl border border-white/60 bg-white/80 p-3 shadow-[0_8px_24px_rgba(15,23,42,0.12)] backdrop-blur-sm sm:w-[17rem]"
          key={`${testimonial.id}-${index}`}
          style={{
            left: `${LANES[index % LANES.length]}%`,
            animationDuration: `${RISE_DURATION_MS}ms`,
          }}
        >
          <Quote aria-hidden="true" className="size-3.5 text-accent" />
          <blockquote className="mt-1 text-[0.8rem] leading-snug text-[#101a34]">{body}</blockquote>
          <figcaption className="mt-1.5 text-[0.7rem] font-semibold text-muted">
            {attribution(testimonial)}
          </figcaption>
        </figure>
      )}
    </div>
  );
}

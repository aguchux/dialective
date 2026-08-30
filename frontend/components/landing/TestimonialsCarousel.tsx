'use client';

import { ChevronLeft, ChevronRight, Quote } from 'lucide-react';
import { useRef, useState } from 'react';

export interface LandingTestimonial {
  id: string;
  kind: 'VIDEO' | 'TEXT';
  text: string | null;
  videoUrl: string | null;
  trainerFirstName: string | null;
  dialectName: string | null;
}

function trainerLabel(testimonial: LandingTestimonial): string {
  const name = testimonial.trainerFirstName ?? 'A Dialect Library trainer';
  return testimonial.dialectName ? `${name} · ${testimonial.dialectName}` : name;
}

export function TestimonialsCarousel({ testimonials }: { testimonials: LandingTestimonial[] }) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  if (testimonials.length === 0) {
    return null;
  }

  function scrollToIndex(index: number) {
    const track = trackRef.current;
    if (!track) return;
    const clamped = Math.max(0, Math.min(testimonials.length - 1, index));
    const card = track.children[clamped] as HTMLElement | undefined;
    card?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
    setActiveIndex(clamped);
  }

  return (
    <section
      aria-labelledby="testimonials-title"
      className="mx-auto grid max-w-280 gap-6 py-8 pb-9"
    >
      <div className="flex items-center justify-between gap-4">
        <h2 id="testimonials-title" className="text-2xl font-black md:text-[2rem]">
          What trainers say
        </h2>
        <div className="hidden shrink-0 items-center gap-2 md:flex">
          <button
            aria-label="Previous testimonial"
            className="grid size-10 place-items-center rounded-full border border-[rgba(5,5,5,0.15)] bg-white/70 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
            disabled={activeIndex <= 0}
            onClick={() => scrollToIndex(activeIndex - 1)}
            type="button"
          >
            <ChevronLeft className="size-5" aria-hidden="true" />
          </button>
          <button
            aria-label="Next testimonial"
            className="grid size-10 place-items-center rounded-full border border-[rgba(5,5,5,0.15)] bg-white/70 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
            disabled={activeIndex >= testimonials.length - 1}
            onClick={() => scrollToIndex(activeIndex + 1)}
            type="button"
          >
            <ChevronRight className="size-5" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div
        className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        ref={trackRef}
      >
        {testimonials.map((testimonial) => (
          <article
            className="grid w-[280px] shrink-0 snap-start gap-3 rounded-lg border border-[rgba(5,5,5,0.1)] bg-white/70 p-5 backdrop-blur-sm md:w-[340px]"
            key={testimonial.id}
          >
            {testimonial.kind === 'VIDEO' && testimonial.videoUrl ? (
              <video
                className="aspect-video w-full rounded-lg bg-black object-cover"
                controls
                preload="metadata"
                src={testimonial.videoUrl}
              />
            ) : (
              <Quote className="size-7 text-accent" aria-hidden="true" />
            )}
            {testimonial.text && (
              <p className="leading-snug text-[rgba(5,5,5,0.72)]">
                &ldquo;{testimonial.text}&rdquo;
              </p>
            )}
            <p className="text-sm font-extrabold">{trainerLabel(testimonial)}</p>
          </article>
        ))}
      </div>

      <div className="flex items-center justify-center gap-1.5 md:hidden">
        {testimonials.map((testimonial, index) => (
          <button
            aria-label={`Go to testimonial ${index + 1}`}
            className={`h-1.5 rounded-full transition-all ${
              index === activeIndex ? 'w-5 bg-accent' : 'w-1.5 bg-[rgba(5,5,5,0.2)]'
            }`}
            key={testimonial.id}
            onClick={() => scrollToIndex(index)}
            type="button"
          />
        ))}
      </div>
    </section>
  );
}

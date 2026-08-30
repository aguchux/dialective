import type { Metadata } from 'next';
import Link from 'next/link';
import { Quote } from 'lucide-react';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { LandingFooter } from '@/components/landing/LandingFooter';
import { LandingHeader } from '@/components/landing/LandingHeader';
import type { LandingTestimonial } from '@/components/landing/TestimonialsCarousel';
import { ParallaxTopBackground } from '@/components/ParallaxTopBackground';
import { getPublicTestimonials } from '@/lib/testimonials-api';

export const metadata: Metadata = {
  title: 'Trainer Testimonials',
  description:
    'Read verified Dialect Library trainer experiences from contributors across dialects.',
};

interface TestimonialsPageProps {
  searchParams?: { page?: string };
}

function trainerLabel(testimonial: LandingTestimonial): string {
  const name = testimonial.trainerFirstName ?? 'A Dialect Library trainer';
  return testimonial.dialectName ? `${name} - ${testimonial.dialectName}` : name;
}

function pageNumber(value: string | undefined): number {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

export default async function TestimonialsPage({ searchParams }: TestimonialsPageProps) {
  const requestedPage = pageNumber(searchParams?.page);
  const data = await getPublicTestimonials(requestedPage, 12).catch(() => null);
  const testimonials = data?.items ?? [];
  const currentPage = data?.page ?? requestedPage;
  const totalPages = data?.totalPages ?? 1;

  return (
    <main className="relative isolate min-h-screen overflow-hidden bg-white text-[#050505]">
      <ParallaxTopBackground />
      <LandingHeader />
      <div className="relative z-10 mx-auto grid max-w-6xl gap-8 px-4 py-6 md:px-8">
        <Breadcrumbs items={[{ label: 'Testimonials' }]} />
        <header className="grid gap-3 border-b border-line pb-7">
          <p className="text-sm font-extrabold uppercase text-accent">Testimonials</p>
          <h1 className="max-w-3xl text-4xl font-black leading-tight md:text-5xl">
            What trainers say about Dialect Library
          </h1>
          <p className="max-w-2xl text-lg leading-relaxed text-muted">
            Experiences from DIDIT-verified trainers whose testimonials were reviewed and approved
            by the Dialect Library team.
          </p>
        </header>

        {testimonials.length > 0 ? (
          <>
            <section
              className="grid gap-5 md:grid-cols-2 lg:grid-cols-3"
              aria-label="Trainer testimonials"
            >
              {testimonials.map((testimonial) => (
                <article
                  className="grid content-start gap-4 rounded-lg border border-line bg-white p-5 shadow-[0_2px_8px_rgba(27,31,27,0.05)]"
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
                    <Quote className="size-8 text-accent" aria-hidden="true" />
                  )}
                  {testimonial.text && (
                    <p className="leading-relaxed text-muted">&ldquo;{testimonial.text}&rdquo;</p>
                  )}
                  <p className="text-sm font-extrabold text-ink">{trainerLabel(testimonial)}</p>
                </article>
              ))}
            </section>
            {totalPages > 1 && (
              <nav
                className="flex items-center justify-center gap-3"
                aria-label="Testimonials pages"
              >
                {currentPage > 1 ? (
                  <Link
                    className="rounded-lg border border-line px-4 py-2 font-bold text-ink no-underline hover:border-accent hover:text-accent"
                    href={`/testimonials?page=${currentPage - 1}`}
                  >
                    Previous
                  </Link>
                ) : (
                  <span className="rounded-lg border border-line px-4 py-2 font-bold text-muted">
                    Previous
                  </span>
                )}
                <span className="text-sm font-bold text-muted">
                  Page {currentPage} of {totalPages}
                </span>
                {currentPage < totalPages ? (
                  <Link
                    className="rounded-lg border border-accent bg-accent px-4 py-2 font-bold text-white no-underline hover:bg-accent-dark"
                    href={`/testimonials?page=${currentPage + 1}`}
                  >
                    Next
                  </Link>
                ) : (
                  <span className="rounded-lg border border-line px-4 py-2 font-bold text-muted">
                    Next
                  </span>
                )}
              </nav>
            )}
          </>
        ) : (
          <p className="py-12 text-muted">No approved testimonials are available yet.</p>
        )}
      </div>
      <div className="relative z-10">
        <LandingFooter />
      </div>
    </main>
  );
}

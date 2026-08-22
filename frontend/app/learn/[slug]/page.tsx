import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { GraduationCap, Play } from 'lucide-react';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { LandingFooter } from '@/components/landing/LandingFooter';
import { LandingHeader } from '@/components/landing/LandingHeader';
import { getPublishedCoursePreview } from '@/lib/courses-api';

interface CoursePreviewPageProps {
  params: { slug: string };
}

export async function generateMetadata({ params }: CoursePreviewPageProps): Promise<Metadata> {
  const course = await getPublishedCoursePreview(params.slug).catch(() => null);
  if (!course) return { title: 'Course not found', robots: { index: false, follow: false } };
  return {
    title: course.title,
    description: course.summary,
    alternates: { canonical: `/learn/${course.slug}` },
    openGraph: {
      type: 'article',
      title: course.title,
      description: course.summary,
      images: course.coverImageUrl
        ? [{ url: course.coverImageUrl, alt: course.coverImageAlt || course.title }]
        : undefined,
    },
  };
}

export default async function CoursePreviewPage({ params }: CoursePreviewPageProps) {
  const course = await getPublishedCoursePreview(params.slug).catch(() => null);
  if (!course) notFound();

  const isPublic = course.visibility === 'PUBLIC';
  const callbackUrl = `/dashboard/learn/${course.slug}`;

  return (
    <main className="min-h-screen bg-white text-[#050505]">
      <LandingHeader />
      <article>
        <header className="mx-auto grid max-w-4xl gap-5 px-4 pb-8 pt-6 md:px-8">
          <Breadcrumbs
            items={[{ href: '/learn', label: 'Learning Center' }, { label: course.title }]}
          />
          <h1 className="max-w-3xl text-4xl font-black leading-tight md:text-6xl">
            {course.title}
          </h1>
          <p className="max-w-3xl text-xl leading-relaxed text-muted">{course.summary}</p>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
            <span>
              {course.slideCount} {course.slideCount === 1 ? 'slide' : 'slides'}
            </span>
          </div>
        </header>
        {course.coverImageUrl && (
          <div className="relative mx-auto aspect-[16/8] max-w-6xl overflow-hidden md:rounded-lg">
            <Image
              alt={course.coverImageAlt || ''}
              className="object-cover"
              fill
              priority
              sizes="(max-width: 1200px) 100vw, 1152px"
              src={course.coverImageUrl}
            />
          </div>
        )}
        <div className="mx-auto max-w-3xl px-4 py-10 text-center md:px-8 md:py-14">
          {isPublic ? (
            <>
              <Link
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-accent px-6 font-extrabold text-white no-underline hover:bg-accent-dark"
                href={`/learn/${course.slug}/view`}
              >
                <Play className="size-5" aria-hidden="true" />
                Start course
              </Link>
              <p className="mt-4 text-sm text-muted">Free to view, no account needed.</p>
            </>
          ) : (
            <>
              <Link
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-accent px-6 font-extrabold text-white no-underline hover:bg-accent-dark"
                href={`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`}
              >
                <GraduationCap className="size-5" aria-hidden="true" />
                Log in to start this course
              </Link>
              <p className="mt-4 text-sm text-muted">
                New here?{' '}
                <Link
                  className="font-bold text-accent no-underline hover:text-accent-dark"
                  href="/register"
                >
                  Create an account
                </Link>{' '}
                to access the Learning Center.
              </p>
            </>
          )}
          <div className="mt-10 border-t border-line pt-6 text-left">
            <Link
              className="font-bold text-accent no-underline hover:text-accent-dark"
              href="/learn"
            >
              &larr; Back to Learning Center
            </Link>
          </div>
        </div>
      </article>
      <LandingFooter />
    </main>
  );
}

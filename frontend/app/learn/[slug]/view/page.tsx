import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { LandingFooter } from '@/components/landing/LandingFooter';
import { LandingHeader } from '@/components/landing/LandingHeader';
import { CourseSlideViewer } from '@/components/courses/CourseSlideViewer';
import { getPublicCourseStudy } from '@/lib/courses-api';

interface PublicCourseViewPageProps {
  params: { slug: string };
}

export async function generateMetadata({ params }: PublicCourseViewPageProps): Promise<Metadata> {
  const course = await getPublicCourseStudy(params.slug).catch(() => null);
  if (!course) return { title: 'Course not found', robots: { index: false, follow: false } };
  return {
    title: course.title,
    description: course.summary,
    alternates: { canonical: `/learn/${course.slug}/view` },
    robots: { index: false, follow: true },
  };
}

// Server-fetched + no JwtAuthGuard on the API side (see
// CoursesPublicController.getPublicStudy) -- this route is reachable by
// anyone with the link, same as the rest of /learn. Progress is never saved
// here (no logged-in user to attach a CourseProgress row to); the viewer
// simply always starts at slide 0.
export default async function PublicCourseViewPage({ params }: PublicCourseViewPageProps) {
  const course = await getPublicCourseStudy(params.slug).catch(() => null);
  if (!course) notFound();

  return (
    <main className="min-h-screen bg-white text-[#050505]">
      <LandingHeader />
      <div className="mx-auto grid max-w-3xl content-start gap-6 px-4 py-8 md:px-6">
        <div>
          <Breadcrumbs
            items={[
              { href: '/learn', label: 'Learning Center' },
              { href: `/learn/${course.slug}`, label: course.title },
              { label: 'Start' },
            ]}
          />
        </div>
        <header className="grid gap-1.5">
          <h1 className="text-3xl font-black">{course.title}</h1>
          <p className="leading-relaxed text-muted">{course.summary}</p>
        </header>
        <div>
          <Link
            className="inline-flex items-center gap-1.5 text-sm font-bold text-accent no-underline hover:text-accent-dark"
            href={`/learn/${course.slug}`}
          >
            <ArrowLeft className="size-4" aria-hidden="true" /> Back to course overview
          </Link>
        </div>
      </div>
      <LandingFooter />
      <CourseSlideViewer
        closeHref={`/learn/${course.slug}`}
        showCompletionScreen={false}
        slides={course.slides}
      />
    </main>
  );
}

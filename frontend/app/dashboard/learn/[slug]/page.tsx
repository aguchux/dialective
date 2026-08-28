'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useRef } from 'react';
import { ArrowLeft } from 'lucide-react';
import {
  CourseSlideViewer,
  CourseSlideViewerLoading,
} from '@/components/courses/CourseSlideViewer';
import { useGetCourseToStudyQuery, useSaveCourseProgressMutation } from '@/store/api';

export default function StudyCoursePage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const { data: course, isLoading, isError } = useGetCourseToStudyQuery(slug);
  const [saveProgress] = useSaveCourseProgressMutation();

  // Skip re-saving the same index the query already reported (e.g. the
  // initial mount firing onSlideChange at the resumed index) -- avoids a
  // redundant write with no state change.
  const lastSavedRef = useRef<number | null>(null);

  const handleSlideChange = useCallback(
    (index: number) => {
      if (!course) return;
      if (lastSavedRef.current === index) return;
      lastSavedRef.current = index;
      void saveProgress({ slug, lastSlideIndex: index, totalSlides: course.slides.length })
        .unwrap()
        .catch(() => undefined);
    },
    [course, saveProgress, slug],
  );

  return (
    <div className="mx-auto grid min-h-screen max-w-3xl content-start gap-6 px-4 py-8 md:px-6">
      <div>
        <Link
          className="inline-flex items-center gap-1.5 text-sm font-bold text-accent no-underline hover:text-accent-dark"
          href="/dashboard?view=home"
        >
          <ArrowLeft className="size-4" aria-hidden="true" /> Dashboard
        </Link>
      </div>

      {isLoading && <CourseSlideViewerLoading />}

      {isError && (
        <div className="grid min-h-52 place-items-center gap-3 p-5 text-center">
          <p className="font-extrabold">Could not load this course.</p>
          <Link
            className="inline-flex min-h-10 items-center justify-center rounded-lg border border-line px-4 text-sm font-extrabold hover:bg-surface-muted"
            href="/learn"
          >
            Back to Learning Center
          </Link>
        </div>
      )}

      {course && (
        <>
          <header className="grid gap-1.5">
            <h1 className="text-3xl font-black">{course.title}</h1>
            <p className="leading-relaxed text-muted">{course.summary}</p>
          </header>
          <CourseSlideViewer
            alreadyCompleted={course.progress?.completedAt != null}
            courseTitle={course.title}
            initialIndex={course.progress?.lastSlideIndex ?? 0}
            onClose={() => router.push('/dashboard?view=home')}
            onSlideChange={handleSlideChange}
            slides={course.slides}
          />
        </>
      )}
    </div>
  );
}

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

  // Skip an index only after the API has confirmed it. Failed writes remain
  // retryable, including the final slide that unlocks training.
  const lastSavedRef = useRef<number | null>(null);

  const handleSlideChange = useCallback(
    async (index: number) => {
      if (!course) return;
      if (lastSavedRef.current === index) return;
      await saveProgress({
        slug,
        lastSlideIndex: index,
        totalSlides: course.slides.length,
      }).unwrap();
      lastSavedRef.current = index;
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
            // Resume from the high-water mark, not the last-saved cursor --
            // if the trainer had paged backward to review an earlier slide
            // before closing, resuming at lastSlideIndex would still be
            // safe to advance from, but maxSlideIndexReached is the value
            // the backend actually enforces "advance by one" against, so
            // resuming there keeps the first Next click always valid.
            initialIndex={course.progress?.maxSlideIndexReached ?? 0}
            onClose={() => router.push('/dashboard?view=home')}
            onFinish={() => handleSlideChange(course.slides.length - 1)}
            onSlideChange={handleSlideChange}
            slides={course.slides}
          />
        </>
      )}
    </div>
  );
}

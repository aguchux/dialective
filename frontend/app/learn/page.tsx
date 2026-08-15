import Image from 'next/image';
import Link from 'next/link';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { LandingFooter } from '@/components/landing/LandingFooter';
import { LandingHeader } from '@/components/landing/LandingHeader';
import { ParallaxTopBackground } from '@/components/ParallaxTopBackground';
import { getPublishedCourses } from '@/lib/courses-api';

export const metadata = {
  title: 'Learning Center',
  description: 'Courses on voice training, dialect contribution, and getting the most out of Dialect Library.',
};

export default async function LearnPage() {
  const courses = await getPublishedCourses().catch(() => []);
  return (
    <main className="relative isolate min-h-screen overflow-hidden bg-white text-[#050505]">
      <ParallaxTopBackground />
      <LandingHeader />
      <div className="relative z-10 mx-auto grid max-w-5xl gap-8 px-4 py-6 md:px-8">
        <Breadcrumbs items={[{ label: 'Learning Center' }]} />
        <header className="grid gap-3 border-b border-line pb-7">
          <p className="text-sm font-extrabold uppercase text-accent">Learning Center</p>
          <h1 className="max-w-3xl text-4xl font-black leading-tight md:text-5xl">Learn Dialect Library</h1>
          <p className="max-w-2xl text-lg leading-relaxed text-muted">
            Short, narrated courses on voice training, dialect contribution, and getting paid on the platform.
            Log in to start any course.
          </p>
        </header>
        <section className="grid gap-6 md:grid-cols-2" aria-label="Courses">
          {courses.map((course) => (
            <article className="group grid content-start gap-3 overflow-hidden rounded-lg border border-line bg-white" key={course.slug}>
              {course.coverImageUrl && (
                <Link className="relative block aspect-[16/9] overflow-hidden" href={`/learn/${course.slug}`}>
                  <Image
                    alt={course.coverImageAlt || ''}
                    className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                    fill
                    sizes="(max-width: 768px) 100vw, 480px"
                    src={course.coverImageUrl}
                  />
                </Link>
              )}
              <div className="grid gap-3 p-5">
                {course.visibility === 'PUBLIC' && (
                  <span className="inline-flex w-fit items-center rounded-full bg-accent/10 px-2.5 py-1 text-xs font-extrabold uppercase text-accent">
                    Public &middot; no login needed
                  </span>
                )}
                <h2 className="text-2xl font-black leading-tight">
                  <Link className="text-ink no-underline hover:text-accent" href={`/learn/${course.slug}`}>{course.title}</Link>
                </h2>
                <p className="leading-relaxed text-muted">{course.summary}</p>
                <Link className="font-bold text-accent no-underline hover:text-accent-dark" href={`/learn/${course.slug}`}>View course &rarr;</Link>
              </div>
            </article>
          ))}
          {courses.length === 0 && <p className="py-12 text-muted">No courses have been published yet.</p>}
        </section>
      </div>
      <div className="relative z-10"><LandingFooter /></div>
    </main>
  );
}

import { PUBLIC_API_V1_BASE_URL } from './public-api';
import type { CourseSlide, CourseVisibility } from '@/store/api';

export interface PublicCourseCard {
  id: string;
  slug: string;
  title: string;
  summary: string;
  visibility: CourseVisibility;
  coverImageUrl: string | null;
  coverImageAlt: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PublicCoursePreview extends PublicCourseCard {
  slideCount: number;
}

// Full slide content for a visibility=PUBLIC course, no auth required --
// distinct from CourseStudy (store/api.ts), which is the protected shape and
// includes a per-trainer progress field this one deliberately omits.
export interface PublicCourseStudy {
  id: string;
  slug: string;
  title: string;
  summary: string;
  coverImageUrl: string | null;
  coverImageAlt: string | null;
  slides: CourseSlide[];
}

export async function getPublishedCourses(): Promise<PublicCourseCard[]> {
  const response = await fetch(`${PUBLIC_API_V1_BASE_URL}/courses`, { next: { revalidate: 60 } });
  if (!response.ok) throw new Error(`Courses API returned ${response.status}`);
  return response.json() as Promise<PublicCourseCard[]>;
}

export async function getPublishedCoursePreview(slug: string): Promise<PublicCoursePreview | null> {
  const response = await fetch(`${PUBLIC_API_V1_BASE_URL}/courses/${encodeURIComponent(slug)}`, { next: { revalidate: 60 } });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Courses API returned ${response.status}`);
  return response.json() as Promise<PublicCoursePreview>;
}

// visibility=PUBLIC only -- the API 404s a PRIVATE course's slug here the
// same as a nonexistent one (see CoursesService.getPublicForStudy), so this
// can never be used to read a private course's content without logging in.
export async function getPublicCourseStudy(slug: string): Promise<PublicCourseStudy | null> {
  const response = await fetch(`${PUBLIC_API_V1_BASE_URL}/courses/${encodeURIComponent(slug)}/view`, { next: { revalidate: 60 } });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Courses API returned ${response.status}`);
  return response.json() as Promise<PublicCourseStudy>;
}

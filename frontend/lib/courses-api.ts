import { PUBLIC_API_V1_BASE_URL } from './public-api';

export interface PublicCourseCard {
  id: string;
  slug: string;
  title: string;
  summary: string;
  coverImageUrl: string | null;
  coverImageAlt: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PublicCoursePreview extends PublicCourseCard {
  slideCount: number;
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

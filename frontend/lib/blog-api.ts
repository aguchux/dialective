import { PUBLIC_API_V1_BASE_URL } from './public-api';

export interface PublicEditorBlock {
  id?: string;
  type: string;
  data: Record<string, unknown>;
}

export interface PublicBlogPost {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  coverImageUrl: string | null;
  coverImageAlt: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  readMinutes?: number;
  content?: { time?: number; version?: string; blocks: PublicEditorBlock[] };
}

export async function getPublishedBlogPosts(): Promise<PublicBlogPost[]> {
  const response = await fetch(`${PUBLIC_API_V1_BASE_URL}/blog/posts`, { next: { revalidate: 60 } });
  if (!response.ok) throw new Error(`Blog API returned ${response.status}`);
  return response.json() as Promise<PublicBlogPost[]>;
}

export async function getPublishedBlogPost(slug: string): Promise<PublicBlogPost | null> {
  const response = await fetch(`${PUBLIC_API_V1_BASE_URL}/blog/posts/${encodeURIComponent(slug)}`, { next: { revalidate: 60 } });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Blog API returned ${response.status}`);
  return response.json() as Promise<PublicBlogPost>;
}

export function estimateReadMinutes(post: PublicBlogPost): number {
  if (post.readMinutes) return post.readMinutes;
  const text = JSON.stringify(post.content?.blocks ?? []).replace(/<[^>]*>/g, ' ').replace(/[^a-zA-Z0-9']+/g, ' ');
  return Math.max(1, Math.ceil(text.trim().split(/\s+/).filter(Boolean).length / 200));
}

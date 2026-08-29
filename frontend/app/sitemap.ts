import type { MetadataRoute } from 'next';
import { getPublishedBlogPosts } from '@/lib/blog-api';
import { getPublishedCourses } from '@/lib/courses-api';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://dialectlibrary.com';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const routes = ['/', '/about', '/blog', '/data-access', '/faq'];
  const legalRoutes = ['/terms', '/privacy', '/cookies'];
  const [posts, courses] = await Promise.all([
    getPublishedBlogPosts().catch(() => []),
    getPublishedCourses().catch(() => []),
  ]);
  return [
    ...routes.map((route) => ({
      url: `${siteUrl}${route}`,
      changeFrequency: (route === '/' ? 'weekly' : 'monthly') as 'weekly' | 'monthly',
      priority: route === '/' ? 1 : 0.7,
    })),
    ...legalRoutes.map((route) => ({
      url: `${siteUrl}${route}`,
      changeFrequency: 'yearly' as const,
      priority: 0.3,
    })),
    ...posts.map((post) => ({
      url: `${siteUrl}/blog/${post.slug}`,
      lastModified: new Date(post.updatedAt),
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    })),
    ...courses.map((course) => ({
      url: `${siteUrl}/learn/${course.slug}`,
      lastModified: new Date(course.updatedAt),
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    })),
  ];
}

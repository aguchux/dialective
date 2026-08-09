import type { MetadataRoute } from 'next';
import { blogPosts } from '@/components/blog/blog-data';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://dialectlibrary.com';

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = ['/', '/about', '/blog', '/data-access', '/faq'];
  const legalRoutes = ['/terms', '/privacy', '/cookies'];
  const postRoutes = blogPosts.map((post) => ({
    url: `${siteUrl}/blog/${post.slug}`,
    lastModified: new Date(post.publishedAt),
    changeFrequency: 'monthly' as const,
    priority: 0.6,
  }));

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
    ...postRoutes,
  ];
}

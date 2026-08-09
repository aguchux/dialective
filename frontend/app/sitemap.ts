import type { MetadataRoute } from 'next';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://dialectlibrary.com';

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = ['/', '/about', '/blog', '/faq', '/login', '/register', '/pipeline-test'];
  const legalRoutes = ['/terms', '/privacy', '/cookies'];

  return [
    ...routes.map((route) => ({
      url: `${siteUrl}${route}`,
      lastModified: new Date(),
      changeFrequency: (route === '/' ? 'weekly' : 'monthly') as 'weekly' | 'monthly',
      priority: route === '/' ? 1 : 0.7,
    })),
    ...legalRoutes.map((route) => ({
      url: `${siteUrl}${route}`,
      lastModified: new Date(),
      changeFrequency: 'yearly' as const,
      priority: 0.3,
    })),
  ];
}

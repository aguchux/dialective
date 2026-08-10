import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BlogContent } from '@/components/blog/BlogContent';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { LandingFooter } from '@/components/landing/LandingFooter';
import { LandingHeader } from '@/components/landing/LandingHeader';
import { estimateReadMinutes, getPublishedBlogPost } from '@/lib/blog-api';

interface BlogPostPageProps { params: { slug: string } }

export async function generateMetadata({ params }: BlogPostPageProps): Promise<Metadata> {
  const post = await getPublishedBlogPost(params.slug).catch(() => null);
  if (!post) return { title: 'Post not found', robots: { index: false, follow: false } };
  const images = post.coverImageUrl ? [{ url: post.coverImageUrl, alt: post.coverImageAlt || post.title }] : undefined;
  return {
    title: post.title,
    description: post.excerpt,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: { type: 'article', title: post.title, description: post.excerpt, images, publishedTime: post.publishedAt ?? undefined, modifiedTime: post.updatedAt },
    twitter: { card: 'summary_large_image', title: post.title, description: post.excerpt, images: post.coverImageUrl ? [post.coverImageUrl] : undefined },
  };
}

function formatDate(iso: string | null) { return iso ? new Date(iso).toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' }) : ''; }

export default async function BlogPostPage({ params }: BlogPostPageProps) {
  const post = await getPublishedBlogPost(params.slug).catch(() => null);
  if (!post?.content) notFound();
  const jsonLd = { '@context': 'https://schema.org', '@type': 'BlogPosting', headline: post.title, description: post.excerpt, image: post.coverImageUrl || undefined, datePublished: post.publishedAt, dateModified: post.updatedAt, author: { '@type': 'Organization', name: 'Dialect Library' }, publisher: { '@type': 'Organization', name: 'Dialect Library' }, mainEntityOfPage: `/blog/${post.slug}` };
  return (
    <main className="min-h-screen bg-white text-[#050505]">
      <LandingHeader />
      <script dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} type="application/ld+json" />
      <article>
        <header className="mx-auto grid max-w-4xl gap-5 px-4 pb-8 pt-6 md:px-8">
          <Breadcrumbs items={[{ href: '/blog', label: 'Blog' }, { label: post.title }]} />
          {post.tag && <span className="w-fit text-sm font-extrabold uppercase text-accent">{post.tag}</span>}
          <h1 className="max-w-3xl text-4xl font-black leading-tight md:text-6xl">{post.title}</h1>
          <p className="max-w-3xl text-xl leading-relaxed text-muted">{post.excerpt}</p>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted"><span>Dialect Library</span><span aria-hidden="true">&middot;</span><time dateTime={post.publishedAt ?? undefined}>{formatDate(post.publishedAt)}</time><span aria-hidden="true">&middot;</span><span>{estimateReadMinutes(post)} min read</span></div>
        </header>
        {post.coverImageUrl && <div className="relative mx-auto aspect-[16/8] max-w-6xl overflow-hidden md:rounded-lg"><Image alt={post.coverImageAlt || ''} className="object-cover" fill priority sizes="(max-width: 1200px) 100vw, 1152px" src={post.coverImageUrl} /></div>}
        <div className="mx-auto max-w-3xl px-4 py-10 md:px-8 md:py-14"><BlogContent blocks={post.content.blocks} /><div className="mt-12 border-t border-line pt-6"><Link className="font-bold text-accent no-underline hover:text-accent-dark" href="/blog">&larr; Back to blog</Link></div></div>
      </article>
      <LandingFooter />
    </main>
  );
}

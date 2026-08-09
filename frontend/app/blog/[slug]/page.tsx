import Link from 'next/link';
import { notFound } from 'next/navigation';
import { blogPosts } from '@/components/blog/blog-data';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { LandingFooter } from '@/components/landing/LandingFooter';
import { LandingHeader } from '@/components/landing/LandingHeader';
import { ParallaxTopBackground } from '@/components/ParallaxTopBackground';

interface BlogPostPageProps {
  params: { slug: string };
}

export function generateStaticParams() {
  return blogPosts.map((post) => ({ slug: post.slug }));
}

export function generateMetadata({ params }: BlogPostPageProps) {
  const post = blogPosts.find((p) => p.slug === params.slug);
  if (!post) {
    return { title: 'Post not found' };
  }
  return { title: post.title, description: post.excerpt };
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

export default function BlogPostPage({ params }: BlogPostPageProps) {
  const post = blogPosts.find((p) => p.slug === params.slug);
  if (!post) {
    notFound();
  }

  return (
    <main className="relative isolate min-h-screen overflow-hidden bg-white text-[#050505]">
      <ParallaxTopBackground />
      <div className="relative z-10">
        <LandingHeader />
      </div>
      <div className="relative z-10 mx-auto grid max-w-3xl gap-6 px-4 py-6 md:px-8">
        <Breadcrumbs items={[{ href: '/blog', label: 'Blog' }, { label: post.title }]} />

        <p className="rounded-lg border border-[#efd6ad] bg-[#fff7e8] p-3 text-sm leading-relaxed text-[#8a4b0f]">
          This is placeholder content — the blog is not implemented yet.
        </p>

        <article className="grid gap-5">
          <header className="grid gap-3">
            <span className="w-fit rounded-full border border-line bg-surface-muted px-2.5 py-1 text-xs font-bold uppercase text-accent">
              {post.tag}
            </span>
            <h1 className="text-4xl font-black leading-tight md:text-5xl">{post.title}</h1>
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
              <span>{post.author}</span>
              <span aria-hidden="true">&middot;</span>
              <span>{formatDate(post.publishedAt)}</span>
              <span aria-hidden="true">&middot;</span>
              <span>{post.readMinutes} min read</span>
            </div>
          </header>

          <div className="grid gap-4 leading-relaxed text-[rgba(5,5,5,0.78)]">
            {post.body.map((paragraph, i) => (
              <p key={i}>{paragraph}</p>
            ))}
          </div>
        </article>

        <div>
          <Link className="font-bold text-accent no-underline hover:text-accent-dark" href="/blog">
            &larr; Back to blog
          </Link>
        </div>
      </div>
      <div className="relative z-10">
        <LandingFooter />
      </div>
    </main>
  );
}

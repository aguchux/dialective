import Image from 'next/image';
import Link from 'next/link';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { LandingFooter } from '@/components/landing/LandingFooter';
import { LandingHeader } from '@/components/landing/LandingHeader';
import { ParallaxTopBackground } from '@/components/ParallaxTopBackground';
import { estimateReadMinutes, getPublishedBlogPosts } from '@/lib/blog-api';

export const metadata = {
  title: 'Blog',
  description: 'Updates from Dialect Library on voice AI, language data, contributors, and underrepresented dialects.',
};

function formatDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' }) : '';
}

export default async function BlogPage() {
  const posts = await getPublishedBlogPosts().catch(() => []);
  return (
    <main className="relative isolate min-h-screen overflow-hidden bg-white text-[#050505]">
      <ParallaxTopBackground />
      <div className="relative z-10"><LandingHeader /></div>
      <div className="relative z-10 mx-auto grid max-w-5xl gap-8 px-4 py-6 md:px-8">
        <Breadcrumbs items={[{ label: 'Blog' }]} />
        <header className="grid gap-3 border-b border-line pb-7">
          <p className="text-sm font-extrabold uppercase text-accent">Blog</p>
          <h1 className="max-w-3xl text-4xl font-black leading-tight md:text-5xl">Ideas, progress, and field notes</h1>
          <p className="max-w-2xl text-lg leading-relaxed text-muted">Updates on the platform, the trainer program, and building voice AI for underrepresented dialects.</p>
        </header>
        <section className="grid gap-6 md:grid-cols-2" aria-label="Blog posts">
          {posts.map((post) => <article className="group grid content-start gap-3 overflow-hidden rounded-lg border border-line bg-white" key={post.slug}>
            {post.coverImageUrl && <Link className="relative block aspect-[16/9] overflow-hidden" href={`/blog/${post.slug}`}><Image alt={post.coverImageAlt || ''} className="object-cover transition-transform duration-300 group-hover:scale-[1.02]" fill sizes="(max-width: 768px) 100vw, 480px" src={post.coverImageUrl} /></Link>}
            <div className="grid gap-3 p-5">
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted"><span>{formatDate(post.publishedAt)}</span><span aria-hidden="true">&middot;</span><span>{estimateReadMinutes(post)} min read</span></div>
              <h2 className="text-2xl font-black leading-tight"><Link className="text-ink no-underline hover:text-accent" href={`/blog/${post.slug}`}>{post.title}</Link></h2>
              <p className="leading-relaxed text-muted">{post.excerpt}</p>
              <Link className="font-bold text-accent no-underline hover:text-accent-dark" href={`/blog/${post.slug}`}>Read article &rarr;</Link>
            </div>
          </article>)}
          {posts.length === 0 && <p className="py-12 text-muted">No articles have been published yet.</p>}
        </section>
      </div>
      <div className="relative z-10"><LandingFooter /></div>
    </main>
  );
}

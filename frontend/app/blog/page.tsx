import Link from 'next/link';
import { blogPosts } from '@/components/blog/blog-data';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { LandingFooter } from '@/components/landing/LandingFooter';
import { LandingHeader } from '@/components/landing/LandingHeader';
import { ParallaxTopBackground } from '@/components/ParallaxTopBackground';

export const metadata = {
  title: 'Blog',
  description: 'Updates and notes from the Dialect Library team on building voice AI for underrepresented dialects.',
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

export default function BlogPage() {
  const posts = [...blogPosts].sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));

  return (
    <main className="relative isolate min-h-screen overflow-hidden bg-white text-[#050505]">
      <ParallaxTopBackground />
      <div className="relative z-10">
        <LandingHeader />
      </div>
      <div className="relative z-10 mx-auto grid max-w-4xl gap-6 px-4 py-6 md:px-8">
        <Breadcrumbs items={[{ label: 'Blog' }]} />

        <section className="grid gap-3 rounded-lg border border-line bg-surface p-5">
          <p className="text-sm font-extrabold uppercase text-accent">Blog</p>
          <h1 className="text-4xl font-black leading-tight">Notes from Dialect Library</h1>
          <p className="max-w-2xl leading-relaxed text-muted">
            Updates on the platform, the trainer program, and building voice AI for underrepresented dialects.
          </p>
        </section>

        <p className="rounded-lg border border-[#efd6ad] bg-[#fff7e8] p-3 text-sm leading-relaxed text-[#8a4b0f]">
          This is placeholder content — the blog is not implemented yet. Posts shown here are mock content for
          layout purposes only.
        </p>

        <section className="grid gap-4" aria-label="Blog posts">
          {posts.map((post) => (
            <article
              className="grid gap-2 rounded-lg border border-line bg-surface p-5 transition-colors hover:border-accent"
              key={post.slug}
            >
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
                <span className="rounded-full border border-line bg-surface-muted px-2.5 py-1 text-xs font-bold uppercase text-accent">
                  {post.tag}
                </span>
                <span>{formatDate(post.publishedAt)}</span>
                <span aria-hidden="true">&middot;</span>
                <span>{post.readMinutes} min read</span>
              </div>
              <h2 className="text-2xl font-black leading-tight">
                <Link className="text-[#050505] no-underline hover:text-accent" href={`/blog/${post.slug}`}>
                  {post.title}
                </Link>
              </h2>
              <p className="leading-relaxed text-muted">{post.excerpt}</p>
              <div>
                <Link className="font-bold text-accent no-underline hover:text-accent-dark" href={`/blog/${post.slug}`}>
                  Read more &rarr;
                </Link>
              </div>
            </article>
          ))}
        </section>
      </div>
      <div className="relative z-10">
        <LandingFooter />
      </div>
    </main>
  );
}

import Link from 'next/link';
import { blogPosts } from '@/components/blog/blog-data';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

export function LandingBlog() {
  const posts = [...blogPosts].sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1)).slice(0, 4);

  return (
    <section className="mx-auto grid max-w-280 gap-6 py-8 pb-9" aria-labelledby="landing-blog-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id="landing-blog-title" className="text-2xl font-black md:text-[2rem]">
          From the blog
        </h2>
        <Link className="font-bold text-accent no-underline hover:text-accent-dark" href="/blog">
          View all posts &rarr;
        </Link>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {posts.map((post) => (
          <article
            className="grid gap-2 rounded-lg border border-[rgba(5,5,5,0.1)] bg-white/70 p-5 backdrop-blur-sm transition-colors hover:border-accent"
            key={post.slug}
          >
            <span className="w-fit rounded-full border border-line bg-surface-muted px-2.5 py-1 text-xs font-bold uppercase text-accent">
              {post.tag}
            </span>
            <h3 className="text-lg font-extrabold leading-snug">
              <Link className="text-[#050505] no-underline hover:text-accent" href={`/blog/${post.slug}`}>
                {post.title}
              </Link>
            </h3>
            <p className="line-clamp-3 leading-snug text-[rgba(5,5,5,0.68)]">{post.excerpt}</p>
            <div className="text-xs text-muted">{formatDate(post.publishedAt)}</div>
          </article>
        ))}
      </div>
    </section>
  );
}

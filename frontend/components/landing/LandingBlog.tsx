import Image from 'next/image';
import Link from 'next/link';
import { getPublishedBlogPosts } from '@/lib/blog-api';

function formatDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' }) : '';
}

export async function LandingBlog() {
  const posts = (await getPublishedBlogPosts().catch(() => [])).slice(0, 4);
  if (posts.length === 0) return null;
  return (
    <section className="mx-auto grid max-w-280 gap-6 py-8 pb-9" aria-labelledby="landing-blog-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id="landing-blog-title" className="text-2xl font-black md:text-[2rem]">From the blog</h2>
        <Link className="font-bold text-accent no-underline hover:text-accent-dark" href="/blog">View all posts &rarr;</Link>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {posts.map((post) => <article className="group grid content-start gap-3 overflow-hidden rounded-lg border border-[rgba(5,5,5,0.1)] bg-white/80" key={post.slug}>
          {post.coverImageUrl && <Link className="relative block aspect-video overflow-hidden" href={`/blog/${post.slug}`}><Image alt={post.coverImageAlt || ''} className="object-cover transition-transform duration-300 group-hover:scale-[1.03]" fill sizes="(max-width: 768px) 100vw, 280px" src={post.coverImageUrl} /></Link>}
          <div className="grid gap-2 p-4"><h3 className="text-lg font-extrabold leading-snug"><Link className="text-[#050505] no-underline hover:text-accent" href={`/blog/${post.slug}`}>{post.title}</Link></h3><p className="line-clamp-3 leading-snug text-[rgba(5,5,5,0.68)]">{post.excerpt}</p><time className="text-xs text-muted" dateTime={post.publishedAt ?? undefined}>{formatDate(post.publishedAt)}</time></div>
        </article>)}
      </div>
    </section>
  );
}

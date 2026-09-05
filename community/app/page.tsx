'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { MessageSquare, Eye, Heart, Pin } from 'lucide-react';
import { useListPostsQuery, type CommunityFeedTab } from '@/store/api';
import { Card, PageHeading } from '@/components/ui';

const TABS: { key: CommunityFeedTab; label: string }[] = [
  { key: 'latest', label: 'Latest' },
  { key: 'unanswered', label: 'Unanswered' },
  { key: 'for-you', label: 'For You' },
];

export default function HomePage() {
  const { status } = useSession();
  const [tab, setTab] = useState<CommunityFeedTab>('latest');
  const { data, isFetching } = useListPostsQuery({ tab: tab === 'for-you' && status !== 'authenticated' ? 'latest' : tab });

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <PageHeading title="Community" subtitle="Ask questions. Share knowledge. Learn together." />

      <div className="mb-5 flex gap-1 border-b border-line">
        {TABS.map((t) => (
          <button
            className={`border-b-2 px-3 py-2.5 text-sm font-bold transition-colors ${
              tab === t.key ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-ink'
            }`}
            key={t.key}
            onClick={() => setTab(t.key)}
            type="button"
          >
            {t.label}
          </button>
        ))}
      </div>

      {isFetching && !data ? (
        <p className="py-12 text-center text-sm text-muted">Loading...</p>
      ) : (data?.items.length ?? 0) === 0 ? (
        <Card className="p-8 text-center">
          <p className="font-bold text-ink">No posts yet</p>
          <p className="mt-1 text-sm text-muted">Be the first to start a discussion.</p>
          <Link className="mt-4 inline-block font-bold text-accent" href="/new">
            Create a post &rarr;
          </Link>
        </Card>
      ) : (
        <div className="grid gap-3">
          {data!.items.map((post) => (
            <Link href={`/post/${post.slug}`} key={post.id}>
              <Card className="p-4 transition-colors hover:border-accent">
                <div className="mb-1.5 flex items-center gap-2 text-xs font-bold text-muted">
                  {post.isPinned && <Pin aria-hidden="true" className="size-3 text-accent" />}
                  <span className="rounded-full bg-surface-muted px-2 py-0.5 text-accent-dark">
                    {post.space.name}
                  </span>
                  <span>&middot;</span>
                  <span>{post.author.displayName}</span>
                </div>
                <h2 className="text-base font-black text-ink">{post.title}</h2>
                <div className="mt-2 flex items-center gap-4 text-xs font-semibold text-muted">
                  <span className="flex items-center gap-1">
                    <MessageSquare aria-hidden="true" className="size-3.5" /> {post.replyCount}
                  </span>
                  <span className="flex items-center gap-1">
                    <Heart aria-hidden="true" className="size-3.5" /> {post.likeCount}
                  </span>
                  <span className="flex items-center gap-1">
                    <Eye aria-hidden="true" className="size-3.5" /> {post.viewCount}
                  </span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

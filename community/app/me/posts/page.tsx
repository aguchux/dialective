'use client';

import Link from 'next/link';
import { useListMyPostsQuery } from '@/store/api';
import { Card, PageHeading } from '@/components/ui';

export default function MyPostsPage() {
  const { data } = useListMyPostsQuery();

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <PageHeading title="My Posts" subtitle="Manage your community contributions." />
      {(data?.items.length ?? 0) === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-muted">You haven&apos;t posted yet.</p>
        </Card>
      ) : (
        <div className="grid gap-3">
          {data!.items.map((post) => (
            <Link href={`/post/${post.slug}`} key={post.id}>
              <Card className="p-4 transition-colors hover:border-accent">
                <h2 className="text-base font-black text-ink">{post.title}</h2>
                <p className="mt-1 text-xs font-semibold text-muted">
                  {post.replyCount} replies &middot; {post.likeCount} likes
                </p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

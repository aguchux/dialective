'use client';

import Link from 'next/link';
import { useListBookmarksQuery } from '@/store/api';
import { Card, PageHeading } from '@/components/ui';

export default function SavedPage() {
  const { data } = useListBookmarksQuery();

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <PageHeading title="Bookmarks" subtitle="Your saved discussions." />
      {(data?.length ?? 0) === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-muted">No bookmarks yet.</p>
        </Card>
      ) : (
        <div className="grid gap-3">
          {data!.map((post) => (
            <Link href={`/post/${post.slug}`} key={post.id}>
              <Card className="p-4 transition-colors hover:border-accent">
                <h2 className="text-base font-black text-ink">{post.title}</h2>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

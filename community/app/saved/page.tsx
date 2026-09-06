'use client';

import { useMemo, useState } from 'react';
import { Bookmark } from 'lucide-react';
import { useListBookmarksQuery } from '@/store/api';
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageFrame,
  PageHeading,
  SegmentedTabs,
} from '@/components/ui';
import { PostCard } from '@/components/community-content';

type SavedTab = 'all' | 'posts' | 'guides';

export default function SavedPage() {
  const [tab, setTab] = useState<SavedTab>('all');
  const { data, isLoading, isError, refetch } = useListBookmarksQuery();
  const items = useMemo(() => data ?? [], [data]);

  return (
    <PageFrame className="max-w-[1040px]">
      <PageHeading
        icon={<Bookmark aria-hidden="true" className="size-6" />}
        subtitle="Keep useful community discussions close at hand."
        title="Bookmarks"
      />
      <div className="mb-5 max-w-xl">
        <SegmentedTabs
          ariaLabel="Bookmark type"
          items={[
            { key: 'all', label: 'All' },
            { key: 'posts', label: 'Posts' },
            { key: 'guides', label: 'Guides' },
          ]}
          onChange={setTab}
          value={tab}
        />
      </div>
      {tab === 'guides' ? (
        <EmptyState
          description="Guides will be available as the community library grows."
          title="No guides saved yet"
        />
      ) : isLoading ? (
        <LoadingState label="Loading bookmarks" />
      ) : isError ? (
        <ErrorState onRetry={() => void refetch()} retryLabel="Retry loading bookmarks" />
      ) : items.length ? (
        <div className="grid gap-3">
          {items.map((post) => (
            <PostCard key={post.id} post={post} showBookmarkFooter />
          ))}
        </div>
      ) : (
        <EmptyState
          description="Save a discussion to find it quickly later."
          title="No bookmarks yet"
        />
      )}
    </PageFrame>
  );
}

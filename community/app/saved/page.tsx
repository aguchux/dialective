'use client';

import { useRouter } from 'next/navigation';
import { Bookmark } from 'lucide-react';
import { useListBookmarksQuery } from '@/store/api';
import { EmptyState, ErrorState, LoadingState, PageFrame, PageHeading } from '@/components/ui';
import { PostCard } from '@/components/community-content';
import { usePostOverflow } from '@/lib/use-post-overflow';
import { usePostActions } from '@/lib/use-post-actions';

export default function SavedPage() {
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useListBookmarksQuery();
  const { overflowItemsFor, dialogs } = usePostOverflow();
  const { postActions } = usePostActions();

  return (
    <PageFrame className="max-w-[1040px]">
      <PageHeading
        icon={<Bookmark aria-hidden="true" className="size-6" />}
        subtitle="Keep useful community discussions close at hand."
        title="Bookmarks"
      />
      {isLoading ? (
        <LoadingState label="Loading bookmarks" />
      ) : isError ? (
        <ErrorState onRetry={() => void refetch()} retryLabel="Retry loading bookmarks" />
      ) : data?.length ? (
        <div className="grid gap-2.5">
          {data.map((post) => (
            <PostCard
              key={post.id}
              {...postActions(post)}
              overflowItems={overflowItemsFor(post, () => router.push(`/post/${post.slug}`))}
              post={post}
              showBookmarkFooter
            />
          ))}
        </div>
      ) : (
        <EmptyState
          description="Save a discussion to find it quickly later."
          title="No bookmarks yet"
        />
      )}
      {dialogs}
    </PageFrame>
  );
}

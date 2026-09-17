'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileText } from 'lucide-react';
import { normalizeErrorMessage, useListMyPostsQuery, useUpdatePostMutation } from '@/store/api';
import {
  EmptyState,
  ErrorState,
  ErrorText,
  LoadingState,
  PageFrame,
  PageHeading,
  SegmentedTabs,
} from '@/components/ui';
import { PostCard } from '@/components/community-content';
import { usePostOverflow } from '@/lib/use-post-overflow';

type MyPostsTab = 'published' | 'drafts';

export default function MyPostsPage() {
  const router = useRouter();
  const [tab, setTab] = useState<MyPostsTab>('published');
  const { data, isLoading, isError, refetch } = useListMyPostsQuery();
  const { overflowItemsFor, dialogs } = usePostOverflow();
  const [updatePost] = useUpdatePostMutation();
  const [publishError, setPublishError] = useState<string | null>(null);
  const items = useMemo(
    () =>
      (data?.items ?? []).filter((post) =>
        tab === 'drafts' ? post.status === 'DRAFT' : post.status !== 'DRAFT',
      ),
    [data, tab],
  );

  async function publish(postId: string) {
    setPublishError(null);
    try {
      await updatePost({ id: postId, status: 'PUBLISHED' }).unwrap();
    } catch (err) {
      setPublishError(
        normalizeErrorMessage(err, 'Could not publish this draft. Please try again.'),
      );
    }
  }

  return (
    <PageFrame className="max-w-[1040px]">
      <PageHeading
        icon={<FileText aria-hidden="true" className="size-6" />}
        subtitle="Review the discussions you have started."
        title="My posts"
      />
      <div className="mb-5 max-w-md">
        <SegmentedTabs
          ariaLabel="Post status"
          items={[
            { key: 'published', label: 'Published' },
            { key: 'drafts', label: 'Drafts' },
          ]}
          onChange={setTab}
          value={tab}
        />
      </div>
      {publishError && (
        <div className="mb-4">
          <ErrorText>{publishError}</ErrorText>
        </div>
      )}
      {isLoading ? (
        <LoadingState label="Loading your posts" />
      ) : isError ? (
        <ErrorState onRetry={() => void refetch()} retryLabel="Retry loading posts" />
      ) : items.length ? (
        <div className="grid gap-3">
          {items.map((post) => (
            <PostCard
              key={post.id}
              overflowItems={[
                ...(post.status === 'DRAFT'
                  ? [{ label: 'Publish', onSelect: () => void publish(post.id) }]
                  : []),
                ...overflowItemsFor(post, () => router.push(`/post/${post.slug}`)),
              ]}
              post={post}
              status={post.status === 'DRAFT' ? 'DRAFT' : 'PUBLISHED'}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          description={
            tab === 'drafts'
              ? 'Drafts you save will appear here.'
              : 'Posts you publish will appear here.'
          }
          title={tab === 'drafts' ? 'No drafts yet' : 'No published posts yet'}
        />
      )}
      {dialogs}
    </PageFrame>
  );
}

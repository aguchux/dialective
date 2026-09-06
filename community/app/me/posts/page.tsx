'use client';

import { useMemo, useState } from 'react';
import { FileText } from 'lucide-react';
import { useListMyPostsQuery } from '@/store/api';
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageFrame,
  PageHeading,
  SegmentedTabs,
} from '@/components/ui';
import { PostCard } from '@/components/community-content';

type MyPostsTab = 'published' | 'drafts';

export default function MyPostsPage() {
  const [tab, setTab] = useState<MyPostsTab>('published');
  const { data, isLoading, isError, refetch } = useListMyPostsQuery();
  const items = useMemo(
    () =>
      (data?.items ?? []).filter((post) =>
        tab === 'drafts' ? post.status === 'DRAFT' : post.status !== 'DRAFT',
      ),
    [data, tab],
  );

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
      {isLoading ? (
        <LoadingState label="Loading your posts" />
      ) : isError ? (
        <ErrorState onRetry={() => void refetch()} retryLabel="Retry loading posts" />
      ) : items.length ? (
        <div className="grid gap-3">
          {items.map((post) => (
            <PostCard
              key={post.id}
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
    </PageFrame>
  );
}

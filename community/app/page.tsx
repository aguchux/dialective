'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { useSession } from 'next-auth/react';
import {
  useAddBookmarkMutation,
  useLikePostMutation,
  useListPostsQuery,
  useRemoveBookmarkMutation,
  useReactToPostMutation,
  useRemovePostReactionMutation,
  useUnlikePostMutation,
  type CommunityFeedTab,
} from '@/store/api';
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageFrame,
  PageHeading,
  SegmentedTabs,
} from '@/components/ui';
import { PostCard } from '@/components/community-content';
import { usePostOverflow } from '@/lib/use-post-overflow';

const TABS: { key: CommunityFeedTab; label: string }[] = [
  { key: 'for-you', label: 'For You' },
  { key: 'latest', label: 'Latest' },
  { key: 'unanswered', label: 'Unanswered' },
];

export default function HomePage() {
  const router = useRouter();
  const { status } = useSession();
  const [tab, setTab] = useState<CommunityFeedTab>('for-you');
  const queryTab = tab === 'for-you' && status !== 'authenticated' ? 'latest' : tab;
  const { data, isFetching, isError, refetch } = useListPostsQuery({ tab: queryTab });
  const [likePost] = useLikePostMutation();
  const [unlikePost] = useUnlikePostMutation();
  const [addBookmark] = useAddBookmarkMutation();
  const [removeBookmark] = useRemoveBookmarkMutation();
  const [reactToPost] = useReactToPostMutation();
  const [removePostReaction] = useRemovePostReactionMutation();
  const { overflowItemsFor, dialogs } = usePostOverflow();

  return (
    <PageFrame className="max-w-[1040px]">
      <PageHeading
        action={
          <Link
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-extrabold text-white transition-colors hover:bg-accent-dark"
            href="/new"
          >
            <Plus className="size-4" /> New post
          </Link>
        }
        subtitle="Find practical answers, share recording knowledge, and learn with other contributors."
        title="Community"
      />

      <div className="mb-5 max-w-2xl">
        <SegmentedTabs items={TABS} onChange={setTab} value={tab} />
      </div>

      {isFetching && !data ? (
        <LoadingState label="Loading community posts" />
      ) : isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : (data?.items.length ?? 0) === 0 ? (
        <EmptyState
          action={
            <Link
              className="inline-flex min-h-11 items-center justify-center rounded-lg border border-accent bg-accent px-4 py-2.5 text-sm font-extrabold text-white hover:bg-accent-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35"
              href="/new"
            >
              Create a post
            </Link>
          }
          description="Start with a question, a recording tip, or something you learned."
          title="No posts yet"
        />
      ) : (
        <div className="grid gap-2.5">
          {data!.items.map((post) => (
            <PostCard
              key={post.id}
              onBookmark={() =>
                void (post.bookmarkedByMe ? removeBookmark(post.id) : addBookmark(post.id))
              }
              onLike={() => void (post.likedByMe ? unlikePost(post.id) : likePost(post.id))}
              onReaction={(type) =>
                void (post.reactionTypeByMe === type
                  ? removePostReaction(post.id)
                  : reactToPost({ postId: post.id, type }))
              }
              overflowItems={overflowItemsFor(post, () => router.push(`/post/${post.slug}`))}
              post={post}
            />
          ))}
        </div>
      )}
      {dialogs}
    </PageFrame>
  );
}

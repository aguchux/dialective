'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import {
  useAddBookmarkMutation,
  useGetSpaceQuery,
  useJoinSpaceMutation,
  useLeaveSpaceMutation,
  useLikePostMutation,
  useListPostsQuery,
  useRemoveBookmarkMutation,
  useUnlikePostMutation,
  useReactToPostMutation,
  useRemovePostReactionMutation,
} from '@/store/api';
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageFrame,
  SegmentedTabs,
  StatusBanner,
} from '@/components/ui';
import { PostCard } from '@/components/community-content';
import { BackLink } from '@/components/community-navigation';
import { SpaceHero } from '@/components/community-discovery';
import { usePostOverflow } from '@/lib/use-post-overflow';

type SpaceTab = 'posts' | 'about' | 'rules';

export default function SpacePage({ params }: { params: { slug: string } }) {
  const { slug } = params;
  const { status } = useSession();
  const [tab, setTab] = useState<SpaceTab>('posts');
  const [actionError, setActionError] = useState<string | null>(null);
  const {
    data: space,
    isLoading: spaceLoading,
    isError: spaceError,
    refetch: refetchSpace,
  } = useGetSpaceQuery(slug);
  const {
    data: posts,
    isLoading: postsLoading,
    isError,
    refetch,
  } = useListPostsQuery({ spaceId: space?.id }, { skip: !space });
  const [joinSpace, { isLoading: joining }] = useJoinSpaceMutation();
  const [leaveSpace, { isLoading: leaving }] = useLeaveSpaceMutation();
  const [likePost] = useLikePostMutation();
  const [unlikePost] = useUnlikePostMutation();
  const [addBookmark] = useAddBookmarkMutation();
  const [removeBookmark] = useRemoveBookmarkMutation();
  const [reactToPost] = useReactToPostMutation();
  const [removePostReaction] = useRemovePostReactionMutation();
  const { overflowItemsFor, dialogs } = usePostOverflow();
  const router = useRouter();

  if (spaceLoading)
    return (
      <PageFrame>
        <LoadingState label="Loading space" />
      </PageFrame>
    );
  if (spaceError || !space)
    return (
      <PageFrame>
        <ErrorState
          onRetry={() => void refetchSpace()}
          retryLabel="Retry loading space"
          title="This space is unavailable."
          description="We could not load this community space right now."
        />
      </PageFrame>
    );
  const currentSpace = space;

  async function handleMembership() {
    setActionError(null);
    try {
      if (currentSpace.joined) await leaveSpace(currentSpace.id).unwrap();
      else await joinSpace(currentSpace.id).unwrap();
    } catch {
      setActionError(
        currentSpace.joined
          ? 'Could not leave this space. Please try again.'
          : 'Could not join this space. Please try again.',
      );
    }
  }

  return (
    <PageFrame>
      <BackLink />
      <SpaceHero
        joining={joining || leaving}
        onJoin={status === 'authenticated' ? () => void handleMembership() : undefined}
        space={currentSpace}
      />
      {actionError && (
        <div className="mt-3">
          <StatusBanner tone="danger">{actionError}</StatusBanner>
        </div>
      )}
      <div className="mt-5 max-w-3xl">
        <SegmentedTabs
          ariaLabel="Space sections"
          items={[
            { key: 'posts', label: 'Posts' },
            { key: 'about', label: 'About' },
            { key: 'rules', label: 'Rules' },
          ]}
          onChange={setTab}
          value={tab}
        />
      </div>

      <div className="mt-5 max-w-3xl">
        {tab === 'posts' &&
          (postsLoading ? (
            <LoadingState label="Loading space posts" />
          ) : isError ? (
            <ErrorState onRetry={() => void refetch()} retryLabel="Retry loading posts" />
          ) : (posts?.items.length ?? 0) === 0 ? (
            <EmptyState
              description="Start the first discussion in this space."
              title="No posts in this space yet"
            />
          ) : (
            <div className="grid gap-2.5">
              {posts!.items.map((post) => (
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
          ))}
        {tab === 'about' && (
          <div className="rounded-lg border border-line bg-surface p-5 text-[15px] leading-relaxed text-ink shadow-community-card sm:p-6">
            {space.description ??
              'Use this space to ask focused questions, share useful context, and help other contributors.'}
          </div>
        )}
        {tab === 'rules' && (
          <div className="rounded-lg border border-line bg-surface p-5 text-[15px] leading-relaxed text-ink shadow-community-card sm:p-6">
            {space.rules ??
              'Be respectful, stay on topic, and share enough context for other contributors to help.'}
          </div>
        )}
      </div>
      {dialogs}
    </PageFrame>
  );
}

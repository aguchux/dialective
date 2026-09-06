'use client';

import { FormEvent, use, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Lock, Share2 } from 'lucide-react';
import {
  useAddBookmarkMutation,
  useCreateReplyMutation,
  useGetPostQuery,
  useLikePostMutation,
  useLikeReplyMutation,
  useListRepliesQuery,
  useRemoveBookmarkMutation,
  useUnlikePostMutation,
  useUnlikeReplyMutation,
} from '@/store/api';
import { BackLink } from '@/components/community-navigation';
import {
  CommunityAvatar,
  PostMetrics,
  PostTags,
  ReplyCard,
  RoleBadge,
  SafePostBody,
} from '@/components/community-content';
import {
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  PageFrame,
  PrimaryButton,
  TextArea,
} from '@/components/ui';

export default function PostDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { status } = useSession();
  const { data: post, isLoading, isError, refetch } = useGetPostQuery(id);
  const {
    data: replies,
    isLoading: repliesLoading,
    isError: repliesError,
    refetch: refetchReplies,
  } = useListRepliesQuery(post?.id ?? '', { skip: !post });
  const [likePost] = useLikePostMutation();
  const [unlikePost] = useUnlikePostMutation();
  const [likeReply] = useLikeReplyMutation();
  const [unlikeReply] = useUnlikeReplyMutation();
  const [addBookmark] = useAddBookmarkMutation();
  const [removeBookmark] = useRemoveBookmarkMutation();
  const [createReply, { isLoading: replying }] = useCreateReplyMutation();
  const [replyBody, setReplyBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [shared, setShared] = useState(false);

  if (isLoading)
    return (
      <PageFrame>
        <LoadingState label="Loading discussion" />
      </PageFrame>
    );
  if (isError || !post)
    return (
      <PageFrame>
        <ErrorState onRetry={() => void refetch()} />
      </PageFrame>
    );
  const currentPost = post;

  async function submitReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!replyBody.trim()) return;
    setError(null);
    try {
      await createReply({ postId: currentPost.id, body: replyBody.trim() }).unwrap();
      setReplyBody('');
    } catch {
      setError('Could not post your reply. Please try again.');
    }
  }

  async function sharePost() {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: currentPost.title, url });
      else await navigator.clipboard.writeText(url);
      setShared(true);
      window.setTimeout(() => setShared(false), 1800);
    } catch {
      // The share sheet can be dismissed; no error state is needed.
    }
  }

  return (
    <PageFrame className="max-w-[1040px] pb-[calc(116px+env(safe-area-inset-bottom))] sm:pb-8">
      <BackLink
        href={post.space.slug ? `/spaces/${post.space.slug}` : '/'}
        label={post.space.name ? `Back to ${post.space.name}` : 'Back to Community'}
      />
      <h1 className="max-w-4xl text-2xl font-black leading-tight tracking-tight text-ink sm:text-3xl lg:text-4xl">
        {post.title}
      </h1>

      <Card className="mt-5 p-5 sm:p-7">
        <div className="flex items-start gap-3">
          <CommunityAvatar name={post.author.displayName} size="md" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-black text-ink">{post.author.displayName}</p>
              <RoleBadge badge={post.author.badge} />
              <span className="text-xs font-semibold text-muted">
                {new Date(post.createdAt).toLocaleDateString('en-GB')}
              </span>
              {post.isLocked && (
                <Lock aria-label="Locked" className="ml-auto size-4 text-warning" />
              )}
            </div>
            <p className="mt-1 text-xs font-semibold text-muted">in {post.space.name}</p>
          </div>
        </div>
        <SafePostBody className="mt-5" html={post.body} />
        <div className="mt-5">
          <PostTags tags={post.tags} />
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-x-4 border-t border-line pt-2">
          <PostMetrics
            onBookmark={() =>
              void (post.bookmarkedByMe ? removeBookmark(post.id) : addBookmark(post.id))
            }
            onLike={() => void (post.likedByMe ? unlikePost(post.id) : likePost(post.id))}
            post={post}
            showViews
          />
          <button
            aria-live="polite"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-md px-1 text-sm font-bold text-muted hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35"
            onClick={() => void sharePost()}
            type="button"
          >
            <Share2 aria-hidden="true" className="size-5" /> {shared ? 'Link copied' : 'Share post'}
          </button>
        </div>
      </Card>

      <div className="mt-7 flex items-end justify-between gap-3 border-b border-line pb-3">
        <h2 className="text-2xl font-black text-ink">
          {post.replyCount} {post.replyCount === 1 ? 'Reply' : 'Replies'}
        </h2>
        <span className="text-xs font-bold text-muted">Latest first</span>
      </div>

      {repliesLoading ? (
        <LoadingState label="Loading replies" />
      ) : replies?.length ? (
        <div className="mt-3 grid gap-3">
          {replies.map((reply) => (
            <ReplyCard
              key={reply.id}
              onLike={() =>
                void (reply.likedByMe
                  ? unlikeReply({ id: reply.id, postId: post.id })
                  : likeReply({ id: reply.id, postId: post.id }))
              }
              reply={reply}
            />
          ))}
        </div>
      ) : repliesError ? (
        <div className="mt-3">
          <ErrorState
            onRetry={() => void refetchReplies()}
            retryLabel="Retry loading replies"
            title="Could not load replies."
            description="The discussion is available, but replies could not be loaded."
          />
        </div>
      ) : (
        <div className="mt-3">
          <EmptyState
            description="Share the first helpful response to this discussion."
            title="No replies yet"
          />
        </div>
      )}

      {status === 'authenticated' && !post.isLocked ? (
        <Card className="fixed inset-x-0 bottom-[calc(68px+env(safe-area-inset-bottom))] z-30 rounded-none border-x-0 border-b-0 p-3 shadow-none sm:static sm:mt-4 sm:rounded-lg sm:border sm:p-4">
          <form className="flex items-end gap-2" onSubmit={submitReply}>
            <CommunityAvatar name="You" size="sm" />
            <label className="sr-only" htmlFor="reply-body">
              Write a reply
            </label>
            <TextArea
              aria-describedby="reply-count"
              className="min-h-11 flex-1 resize-none py-2.5"
              id="reply-body"
              maxLength={5000}
              onChange={(event) => setReplyBody(event.target.value)}
              placeholder="Write a reply..."
              rows={1}
              value={replyBody}
            />
            <PrimaryButton
              className="shrink-0 px-4"
              pending={replying}
              pendingLabel="Posting"
              type="submit"
            >
              Reply
            </PrimaryButton>
          </form>
          <p className="mt-1 text-right text-[11px] font-semibold text-muted" id="reply-count">
            {replyBody.length}/5000
          </p>
          {error && (
            <p className="mt-2 text-sm font-bold text-danger" role="alert">
              {error}
            </p>
          )}
        </Card>
      ) : post.isLocked ? (
        <p className="mt-5 text-center text-sm font-bold text-muted">This thread is locked.</p>
      ) : null}
    </PageFrame>
  );
}

'use client';

import { FormEvent, use, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Heart, Bookmark, Eye, Lock } from 'lucide-react';
import {
  useAddBookmarkMutation,
  useCreateReplyMutation,
  useGetPostQuery,
  useLikePostMutation,
  useListRepliesQuery,
  useRemoveBookmarkMutation,
  useUnlikePostMutation,
} from '@/store/api';
import { Card, ErrorText, PrimaryButton, TextArea } from '@/components/ui';

export default function PostDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { status } = useSession();
  const { data: post } = useGetPostQuery(id);
  const { data: replies } = useListRepliesQuery(post?.id ?? '', { skip: !post });
  const [likePost] = useLikePostMutation();
  const [unlikePost] = useUnlikePostMutation();
  const [addBookmark] = useAddBookmarkMutation();
  const [removeBookmark] = useRemoveBookmarkMutation();
  const [createReply, { isLoading: replying }] = useCreateReplyMutation();
  const [replyBody, setReplyBody] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!post) {
    return <p className="px-4 py-12 text-center text-sm text-muted">Loading...</p>;
  }

  async function submitReply(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await createReply({ postId: post!.id, body: replyBody }).unwrap();
      setReplyBody('');
    } catch {
      setError('Could not post your reply. Please try again.');
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <Card className="p-6">
        <div className="mb-2 flex items-center gap-2 text-xs font-bold text-muted">
          <span className="rounded-full bg-surface-muted px-2 py-0.5 text-accent-dark">
            {post.space.name}
          </span>
          <span>&middot;</span>
          <span>{post.author.displayName}</span>
          {post.isLocked && (
            <span className="ml-auto flex items-center gap-1 text-warning">
              <Lock aria-hidden="true" className="size-3.5" /> Locked
            </span>
          )}
        </div>
        <h1 className="text-xl font-black text-ink">{post.title}</h1>
        <div className="community-post-body mt-4" dangerouslySetInnerHTML={{ __html: post.body }} />

        <div className="mt-5 flex items-center gap-3 border-t border-line pt-4 text-sm font-bold text-muted">
          <button
            className={`flex items-center gap-1.5 ${post.likedByMe ? 'text-danger' : ''}`}
            onClick={() =>
              void (post.likedByMe ? unlikePost(post.id) : likePost(post.id))
            }
            type="button"
          >
            <Heart aria-hidden="true" className="size-4" fill={post.likedByMe ? 'currentColor' : 'none'} />
            {post.likeCount}
          </button>
          <button
            className={`flex items-center gap-1.5 ${post.bookmarkedByMe ? 'text-accent' : ''}`}
            onClick={() =>
              void (post.bookmarkedByMe ? removeBookmark(post.id) : addBookmark(post.id))
            }
            type="button"
          >
            <Bookmark
              aria-hidden="true"
              className="size-4"
              fill={post.bookmarkedByMe ? 'currentColor' : 'none'}
            />
            Save
          </button>
          <span className="ml-auto flex items-center gap-1.5">
            <Eye aria-hidden="true" className="size-4" /> {post.viewCount}
          </span>
        </div>
      </Card>

      <h2 className="mb-3 mt-6 text-sm font-black text-ink">
        {post.replyCount} {post.replyCount === 1 ? 'Reply' : 'Replies'}
      </h2>

      <div className="grid gap-3">
        {(replies ?? []).map((reply) => (
          <Card className="p-4" key={reply.id}>
            <p className="mb-1.5 text-xs font-bold text-muted">{reply.author.displayName}</p>
            <div className="community-post-body" dangerouslySetInnerHTML={{ __html: reply.body }} />
          </Card>
        ))}
      </div>

      {status === 'authenticated' && !post.isLocked ? (
        <Card className="mt-4 p-4">
          <form className="grid gap-3" onSubmit={submitReply}>
            <TextArea
              minLength={1}
              onChange={(e) => setReplyBody(e.target.value)}
              placeholder="Write a reply..."
              required
              rows={4}
              value={replyBody}
            />
            {error && <ErrorText>{error}</ErrorText>}
            <PrimaryButton className="justify-self-start" disabled={replying} type="submit">
              {replying ? 'Posting...' : 'Reply'}
            </PrimaryButton>
          </form>
        </Card>
      ) : post.isLocked ? (
        <p className="mt-4 text-center text-sm text-muted">This thread is locked.</p>
      ) : null}
    </div>
  );
}

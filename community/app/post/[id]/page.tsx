'use client';

import { FormEvent, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Loader2, Lock, Paperclip, Share2, X } from 'lucide-react';
import {
  normalizeErrorMessage,
  useAddBookmarkMutation,
  useCreateAttachmentUploadUrlMutation,
  useCreateReplyMutation,
  useDeletePostMutation,
  useDeleteReplyMutation,
  useFileReportMutation,
  useGetPostQuery,
  useLikePostMutation,
  useLikeReplyMutation,
  useListRepliesQuery,
  useRemoveBookmarkMutation,
  useReactToPostMutation,
  useRemovePostReactionMutation,
  useUnlikePostMutation,
  useUnlikeReplyMutation,
  useUpdatePostMutation,
  useUpdateReplyMutation,
  type CommunityAttachmentContentType,
  type CommunityReply,
  type CommunityReplySort,
} from '@/store/api';
import type { PendingAttachment } from '@/components/community-form';
import { BackLink } from '@/components/community-navigation';
import {
  AttachmentGallery,
  buildContentOverflowItems,
  CommunityAvatar,
  PostMetrics,
  PostTags,
  ReplyCard,
  RoleBadge,
  SafePostBody,
} from '@/components/community-content';
import { ReportDialog } from '@/components/community-form';
import {
  Card,
  EmptyState,
  ErrorState,
  ErrorText,
  LoadingState,
  Modal,
  OverflowMenu,
  PageFrame,
  PrimaryButton,
  SecondaryButton,
  TextArea,
} from '@/components/ui';

type ReportTarget = { targetType: 'POST' | 'REPLY'; targetId: string };

export default function PostDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const router = useRouter();
  const { data: session, status } = useSession();
  const viewerId = session?.user?.id;
  const [sort, setSort] = useState<CommunityReplySort>('oldest');
  const { data: post, isLoading, isError, refetch } = useGetPostQuery(id);
  const {
    data: replies,
    isLoading: repliesLoading,
    isError: repliesError,
    refetch: refetchReplies,
  } = useListRepliesQuery({ postId: post?.id ?? '', sort }, { skip: !post });
  const [likePost] = useLikePostMutation();
  const [unlikePost] = useUnlikePostMutation();
  const [likeReply] = useLikeReplyMutation();
  const [unlikeReply] = useUnlikeReplyMutation();
  const [addBookmark] = useAddBookmarkMutation();
  const [removeBookmark] = useRemoveBookmarkMutation();
  const [reactToPost] = useReactToPostMutation();
  const [removePostReaction] = useRemovePostReactionMutation();
  const [createReply, { isLoading: replying }] = useCreateReplyMutation();
  const [createAttachmentUploadUrl] = useCreateAttachmentUploadUrlMutation();
  const [replyAttachments, setReplyAttachments] = useState<PendingAttachment[]>([]);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const replyFileInputRef = useRef<HTMLInputElement>(null);
  const [updatePost] = useUpdatePostMutation();
  const [deletePost] = useDeletePostMutation();
  const [updateReply] = useUpdateReplyMutation();
  const [deleteReply] = useDeleteReplyMutation();
  const [fileReport, { isLoading: reporting }] = useFileReportMutation();

  const [replyBody, setReplyBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [shared, setShared] = useState(false);

  const [editingPost, setEditingPost] = useState(false);
  const [editingReplyId, setEditingReplyId] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<
    { kind: 'post' } | { kind: 'reply'; id: string } | null
  >(null);
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);

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
      await createReply({
        postId: currentPost.id,
        body: replyBody.trim(),
        attachments: replyAttachments.map(({ localId: _localId, ...rest }) => rest),
      }).unwrap();
      setReplyBody('');
      setReplyAttachments([]);
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Could not post your reply. Please try again.'));
    }
  }

  async function attachToReply(file: File) {
    if (replyAttachments.length >= 5) {
      setError('You can attach up to 5 files.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('Each file must be 10 MB or smaller.');
      return;
    }
    setError(null);
    setUploadingAttachment(true);
    try {
      const contentType = file.type as CommunityAttachmentContentType;
      const { uploadUrl, key, bucket } = await createAttachmentUploadUrl({ contentType }).unwrap();
      const putResponse = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': contentType },
        body: file,
      });
      if (!putResponse.ok) throw new Error('Upload failed');
      setReplyAttachments((current) => [
        ...current,
        { localId: key, key, bucket, contentType, size: file.size, originalName: file.name },
      ]);
    } catch {
      setError('Could not upload this file. Please try again.');
    } finally {
      setUploadingAttachment(false);
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

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      if (deleteTarget.kind === 'post') {
        await deletePost(currentPost.id).unwrap();
        router.push('/');
        return;
      }
      await deleteReply({ id: deleteTarget.id, postId: currentPost.id }).unwrap();
      setDeleteTarget(null);
    } catch (err) {
      setEditError(normalizeErrorMessage(err, 'Could not delete this. Please try again.'));
      setDeleteTarget(null);
    }
  }

  async function submitReport(input: { reason: string; notes?: string }) {
    if (!reportTarget) return;
    setReportError(null);
    try {
      await fileReport({
        targetType: reportTarget.targetType,
        targetId: reportTarget.targetId,
        reason: input.reason as never,
        notes: input.notes,
      }).unwrap();
      setReportTarget(null);
    } catch (err) {
      setReportError(normalizeErrorMessage(err, 'Could not submit this report. Please try again.'));
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
              {post.isLocked && <Lock aria-label="Locked" className="size-4 text-warning" />}
              <div className="ml-auto -mr-2 -mt-2">
                <OverflowMenu
                  items={buildContentOverflowItems({
                    isOwner: viewerId === post.author.id,
                    onEdit: () => setEditingPost(true),
                    onDelete: () => setDeleteTarget({ kind: 'post' }),
                    onReport: () => setReportTarget({ targetType: 'POST', targetId: post.id }),
                  })}
                  label="Post actions"
                />
              </div>
            </div>
            <p className="mt-1 text-xs font-semibold text-muted">in {post.space.name}</p>
          </div>
        </div>

        {editingPost ? (
          <PostEditForm
            initialBody={currentPost.body}
            initialTitle={currentPost.title}
            onCancel={() => setEditingPost(false)}
            onSave={async (title, body) => {
              setEditError(null);
              try {
                await updatePost({ id: currentPost.id, title, body }).unwrap();
                setEditingPost(false);
              } catch (err) {
                setEditError(
                  normalizeErrorMessage(err, 'Could not save your changes. Please try again.'),
                );
              }
            }}
          />
        ) : (
          <>
            <SafePostBody className="mt-5" html={post.body} />
            {post.attachments.length > 0 && (
              <AttachmentGallery attachments={post.attachments} className="mt-4" />
            )}
          </>
        )}
        {editError && (
          <p className="mt-2">
            <ErrorText>{editError}</ErrorText>
          </p>
        )}

        <div className="mt-5">
          <PostTags tags={post.tags} />
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-x-4 border-t border-line pt-2">
          <PostMetrics
            onBookmark={() =>
              void (post.bookmarkedByMe ? removeBookmark(post.id) : addBookmark(post.id))
            }
            onLike={() => void (post.likedByMe ? unlikePost(post.id) : likePost(post.id))}
            onReaction={(type) =>
              void (post.reactionTypeByMe === type
                ? removePostReaction(post.id)
                : reactToPost({ postId: post.id, type }))
            }
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
        <label className="flex items-center gap-1.5 text-xs font-bold text-muted">
          Sort by:
          <select
            aria-label="Sort replies"
            className="rounded-md border-0 bg-transparent py-1 pl-1 pr-6 text-xs font-bold text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent/35"
            onChange={(event) => setSort(event.target.value as CommunityReplySort)}
            value={sort}
          >
            <option value="oldest">Oldest</option>
            <option value="newest">Newest</option>
            <option value="top">Top</option>
          </select>
        </label>
      </div>

      {repliesLoading ? (
        <LoadingState label="Loading replies" />
      ) : replies?.length ? (
        <div className="mt-3 grid gap-3">
          {replies.map((reply) =>
            editingReplyId === reply.id ? (
              <Card className="p-4 sm:p-5" key={reply.id}>
                <ReplyEditForm
                  initialBody={reply.body}
                  onCancel={() => setEditingReplyId(null)}
                  onSave={async (body) => {
                    setEditError(null);
                    try {
                      await updateReply({ id: reply.id, postId: currentPost.id, body }).unwrap();
                      setEditingReplyId(null);
                    } catch (err) {
                      setEditError(
                        normalizeErrorMessage(
                          err,
                          'Could not save your changes. Please try again.',
                        ),
                      );
                    }
                  }}
                />
              </Card>
            ) : (
              <ReplyCard
                key={reply.id}
                onLike={() =>
                  void (reply.likedByMe
                    ? unlikeReply({ id: reply.id, postId: post.id })
                    : likeReply({ id: reply.id, postId: post.id }))
                }
                overflowItems={overflowItemsFor(reply, viewerId, {
                  onEdit: () => setEditingReplyId(reply.id),
                  onDelete: () => setDeleteTarget({ kind: 'reply', id: reply.id }),
                  onReport: () => setReportTarget({ targetType: 'REPLY', targetId: reply.id }),
                })}
                reply={reply}
              />
            ),
          )}
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
          {replyAttachments.length > 0 && (
            <ul className="mb-2 flex flex-wrap gap-2">
              {replyAttachments.map((attachment) => (
                <li
                  className="flex items-center gap-1.5 rounded-full bg-surface-muted px-3 py-1 text-xs font-bold text-ink"
                  key={attachment.localId}
                >
                  <span className="max-w-32 truncate">{attachment.originalName}</span>
                  <button
                    aria-label={`Remove ${attachment.originalName}`}
                    onClick={() =>
                      setReplyAttachments((current) =>
                        current.filter((item) => item.localId !== attachment.localId),
                      )
                    }
                    type="button"
                  >
                    <X aria-hidden="true" className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
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
            <input
              accept="image/jpeg,image/png,image/webp,audio/mpeg,audio/wav,audio/webm,application/pdf"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) void attachToReply(file);
              }}
              ref={replyFileInputRef}
              type="file"
            />
            <button
              aria-label="Attach a file"
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-muted hover:text-ink disabled:opacity-60"
              disabled={uploadingAttachment}
              onClick={() => replyFileInputRef.current?.click()}
              type="button"
            >
              {uploadingAttachment ? (
                <Loader2 aria-hidden="true" className="size-5 animate-spin" />
              ) : (
                <Paperclip aria-hidden="true" className="size-5" />
              )}
            </button>
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

      {deleteTarget && (
        <Modal
          onClose={() => setDeleteTarget(null)}
          title={deleteTarget.kind === 'post' ? 'Delete post?' : 'Delete reply?'}
        >
          <p className="text-sm leading-relaxed text-muted">
            This cannot be undone. {deleteTarget.kind === 'post' ? 'The post' : 'The reply'} will be
            removed from the community.
          </p>
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              className="min-h-11 rounded-lg border border-line px-4 text-sm font-extrabold text-ink hover:bg-surface-muted"
              onClick={() => setDeleteTarget(null)}
              type="button"
            >
              Cancel
            </button>
            <PrimaryButton
              className="bg-danger hover:bg-danger"
              onClick={() => void confirmDelete()}
              type="button"
            >
              Delete
            </PrimaryButton>
          </div>
        </Modal>
      )}

      {reportTarget && (
        <ReportDialog
          onClose={() => {
            setReportTarget(null);
            setReportError(null);
          }}
          onSubmit={(input) => void submitReport(input)}
          submitting={reporting}
        />
      )}
      {reportError && (
        <p className="fixed inset-x-4 bottom-24 z-50 mx-auto max-w-md">
          <ErrorText>{reportError}</ErrorText>
        </p>
      )}
    </PageFrame>
  );
}

function overflowItemsFor(
  reply: CommunityReply,
  viewerId: string | undefined,
  handlers: { onEdit: () => void; onDelete: () => void; onReport: () => void },
) {
  const isOwner = viewerId === reply.author.id;
  return [
    { label: 'Edit', onSelect: handlers.onEdit, hidden: !isOwner },
    { label: 'Delete', onSelect: handlers.onDelete, tone: 'danger' as const, hidden: !isOwner },
    { label: 'Report', onSelect: handlers.onReport, tone: 'danger' as const, hidden: isOwner },
  ];
}

function PostEditForm({
  initialTitle,
  initialBody,
  onSave,
  onCancel,
}: {
  initialTitle: string;
  initialBody: string;
  onSave: (title: string, body: string) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState(initialBody);
  const [saving, setSaving] = useState(false);

  return (
    <div className="mt-5 grid gap-3">
      <input
        className="min-h-11 w-full rounded-lg border border-line bg-surface px-3.5 text-base font-black text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/15"
        maxLength={160}
        onChange={(event) => setTitle(event.target.value)}
        value={title}
      />
      <TextArea
        maxLength={5000}
        onChange={(event) => setBody(event.target.value)}
        rows={8}
        value={body}
      />
      <div className="flex flex-col-reverse gap-2 sm:flex-row">
        <PrimaryButton
          onClick={async () => {
            setSaving(true);
            await onSave(title, body);
            setSaving(false);
          }}
          pending={saving}
          pendingLabel="Saving"
          type="button"
        >
          Save changes
        </PrimaryButton>
        <SecondaryButton onClick={onCancel} type="button">
          Cancel
        </SecondaryButton>
      </div>
    </div>
  );
}

function ReplyEditForm({
  initialBody,
  onSave,
  onCancel,
}: {
  initialBody: string;
  onSave: (body: string) => void;
  onCancel: () => void;
}) {
  const [body, setBody] = useState(initialBody);
  const [saving, setSaving] = useState(false);

  return (
    <div className="grid gap-3">
      <TextArea
        maxLength={5000}
        onChange={(event) => setBody(event.target.value)}
        rows={4}
        value={body}
      />
      <div className="flex flex-col-reverse gap-2 sm:flex-row">
        <PrimaryButton
          onClick={async () => {
            setSaving(true);
            await onSave(body);
            setSaving(false);
          }}
          pending={saving}
          pendingLabel="Saving"
          type="button"
        >
          Save changes
        </PrimaryButton>
        <SecondaryButton onClick={onCancel} type="button">
          Cancel
        </SecondaryButton>
      </div>
    </div>
  );
}

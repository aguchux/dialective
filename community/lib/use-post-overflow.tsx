'use client';

import { useState, type ReactNode } from 'react';
import { useSession } from 'next-auth/react';
import {
  normalizeErrorMessage,
  useDeletePostMutation,
  useFileReportMutation,
  type CommunityPostCard,
  type CommunityReportReason,
} from '@/store/api';
import { buildContentOverflowItems } from '@/components/community-content';
import { ReportDialog } from '@/components/community-form';
import { ErrorText, Modal, PrimaryButton, type OverflowMenuItem } from '@/components/ui';

/**
 * Shared post-card overflow behavior (edit link, delete confirmation,
 * report dialog) for any page that renders a list of PostCards -- home
 * feed, My Posts, Bookmarks, a space's post list. Editing itself always
 * happens on the post detail page (there's no inline-edit-from-a-card
 * affordance in the mockups), so onEdit here just navigates.
 */
export function usePostOverflow() {
  const { data: session } = useSession();
  const viewerId = session?.user?.id;
  const [deletePost] = useDeletePostMutation();
  const [fileReport, { isLoading: reporting }] = useFileReportMutation();
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [reportTargetId, setReportTargetId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  function overflowItemsFor(post: CommunityPostCard, onEdit: () => void): OverflowMenuItem[] {
    return buildContentOverflowItems({
      isOwner: viewerId === post.author.id,
      onEdit,
      onDelete: () => setDeleteTargetId(post.id),
      onReport: () => setReportTargetId(post.id),
    });
  }

  async function confirmDelete() {
    if (!deleteTargetId) return;
    try {
      await deletePost(deleteTargetId).unwrap();
      setDeleteTargetId(null);
    } catch (err) {
      setActionError(normalizeErrorMessage(err, 'Could not delete this post. Please try again.'));
      setDeleteTargetId(null);
    }
  }

  async function submitReport(input: { reason: CommunityReportReason; notes?: string }) {
    if (!reportTargetId) return;
    try {
      await fileReport({ targetType: 'POST', targetId: reportTargetId, ...input }).unwrap();
      setReportTargetId(null);
    } catch (err) {
      setActionError(normalizeErrorMessage(err, 'Could not submit this report. Please try again.'));
      setReportTargetId(null);
    }
  }

  const dialogs: ReactNode = (
    <>
      {deleteTargetId && (
        <Modal onClose={() => setDeleteTargetId(null)} title="Delete post?">
          <p className="text-sm leading-relaxed text-muted">
            This cannot be undone. The post will be removed from the community.
          </p>
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              className="min-h-11 rounded-lg border border-line px-4 text-sm font-extrabold text-ink hover:bg-surface-muted"
              onClick={() => setDeleteTargetId(null)}
              type="button"
            >
              Cancel
            </button>
            <PrimaryButton className="bg-danger hover:bg-danger" onClick={() => void confirmDelete()} type="button">
              Delete
            </PrimaryButton>
          </div>
        </Modal>
      )}
      {reportTargetId && (
        <ReportDialog
          onClose={() => setReportTargetId(null)}
          onSubmit={(input) => void submitReport(input)}
          submitting={reporting}
        />
      )}
      {actionError && (
        <p className="fixed inset-x-4 bottom-24 z-50 mx-auto max-w-md">
          <ErrorText>{actionError}</ErrorText>
        </p>
      )}
    </>
  );

  return { overflowItemsFor, dialogs };
}

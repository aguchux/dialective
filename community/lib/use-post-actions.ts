'use client';

import { useCallback } from 'react';
import {
  useAddBookmarkMutation,
  useLikePostMutation,
  useReactToPostMutation,
  useRemoveBookmarkMutation,
  useRemovePostReactionMutation,
  useUnlikePostMutation,
  type CommunityPostCard,
  type CommunityReactionType,
} from '@/store/api';

/**
 * The like / bookmark / reaction handlers every post view needs, in one
 * place. Same motivation as usePostOverflow: this wiring was previously
 * copy-pasted into each page, and the pages that never got the paste
 * (Bookmarks, My Posts, Profile) silently rendered posts with no reaction
 * row at all -- PostMetrics hides the emoji buttons when onReaction is
 * undefined, so the omission looked like a deliberately quieter card
 * rather than a missing feature.
 *
 * Each handler toggles: pressing the reaction you already gave removes
 * it, matching how likes and bookmarks already behaved.
 */
export function usePostActions() {
  const [likePost] = useLikePostMutation();
  const [unlikePost] = useUnlikePostMutation();
  const [addBookmark] = useAddBookmarkMutation();
  const [removeBookmark] = useRemoveBookmarkMutation();
  const [reactToPost] = useReactToPostMutation();
  const [removePostReaction] = useRemovePostReactionMutation();

  const onLike = useCallback(
    (post: CommunityPostCard) => () => {
      void (post.likedByMe ? unlikePost(post.id) : likePost(post.id));
    },
    [likePost, unlikePost],
  );

  const onBookmark = useCallback(
    (post: CommunityPostCard) => () => {
      void (post.bookmarkedByMe ? removeBookmark(post.id) : addBookmark(post.id));
    },
    [addBookmark, removeBookmark],
  );

  const onReaction = useCallback(
    (post: CommunityPostCard) => (type: Exclude<CommunityReactionType, 'LIKE'>) => {
      void (post.reactionTypeByMe === type
        ? removePostReaction(post.id)
        : reactToPost({ postId: post.id, type }));
    },
    [reactToPost, removePostReaction],
  );

  /** Spread straight onto a PostCard/PostMetrics: {...postActions(post)} */
  const postActions = useCallback(
    (post: CommunityPostCard) => ({
      onLike: onLike(post),
      onBookmark: onBookmark(post),
      onReaction: onReaction(post),
    }),
    [onBookmark, onLike, onReaction],
  );

  return { postActions, onLike, onBookmark, onReaction };
}

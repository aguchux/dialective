import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import { PUBLIC_API_V1_BASE_URL } from '@/lib/public-api';
import { getCurrentSession } from '@/lib/client-session';

export type CommunityBadge = 'VERIFIED_TRAINER' | 'DISTRIBUTOR' | null;
export type CommunityRole = 'MEMBER' | 'MODERATOR' | 'STAFF';
export type CommunityUserStatus = 'ACTIVE' | 'SUSPENDED' | 'BANNED';

export interface CommunityProfile {
  id: string;
  userId: string;
  displayName: string;
  bio: string | null;
  countryId: string | null;
  country: { id: string; name: string } | null;
  languages: string[];
  dialects: string[];
  role: CommunityRole;
  status: CommunityUserStatus;
  badge: CommunityBadge;
  postCount: number;
  replyCount: number;
  bookmarkCount: number;
  createdAt: string;
}

export interface CommunitySpace {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  rules: string | null;
  isArchived: boolean;
  sortOrder: number;
  joined?: boolean;
}

export interface CommunityTag {
  id: string;
  name: string;
  slug: string;
  isHidden: boolean;
}

export interface CommunityPostAuthor {
  id: string;
  displayName: string;
  badge: CommunityBadge;
}

export interface CommunityPostCard {
  id: string;
  title: string;
  slug: string;
  body: string;
  status: 'DRAFT' | 'PUBLISHED' | 'HIDDEN' | 'DELETED';
  isPinned: boolean;
  isLocked: boolean;
  viewCount: number;
  replyCount: number;
  likeCount: number;
  createdAt: string;
  author: CommunityPostAuthor;
  space: { id: string; name: string; slug: string };
  tags: CommunityTag[];
  likedByMe?: boolean;
  bookmarkedByMe?: boolean;
}

export interface CommunityPostPage {
  items: CommunityPostCard[];
  nextCursor: string | null;
}

export type CommunityFeedTab = 'latest' | 'unanswered' | 'for-you';

export interface CommunityReply {
  id: string;
  postId: string;
  parentReplyId: string | null;
  body: string;
  status: 'PUBLISHED' | 'HIDDEN' | 'DELETED';
  createdAt: string;
  author: CommunityPostAuthor;
  likeCount: number;
  likedByMe?: boolean;
}

export interface CommunityNotification {
  id: string;
  type: 'REPLY_TO_POST' | 'REPLY_TO_REPLY' | 'MENTION' | 'ANNOUNCEMENT' | 'MODERATION_ACTION';
  readAt: string | null;
  createdAt: string;
  actor: { id: string; displayName: string } | null;
  postId: string | null;
  replyId: string | null;
}

export interface CommunityReportReasonInput {
  targetType: 'POST' | 'REPLY' | 'PROFILE';
  targetId: string;
  reason:
    | 'SPAM'
    | 'ABUSE_HARASSMENT'
    | 'MISINFORMATION'
    | 'OFF_TOPIC'
    | 'INAPPROPRIATE_CONTENT'
    | 'IMPERSONATION'
    | 'COPYRIGHT'
    | 'OTHER';
  details?: string;
}

export interface CommunitySearchResults {
  posts: CommunityPostCard[];
  tags: CommunityTag[];
  spaces: CommunitySpace[];
  profiles: CommunityProfile[];
}

const REQUEST_TIMEOUT_MS = 20_000;

const rawBaseQuery = fetchBaseQuery({
  baseUrl: `${PUBLIC_API_V1_BASE_URL}/community`,
  timeout: REQUEST_TIMEOUT_MS,
  prepareHeaders: async (headers) => {
    headers.set('Content-Type', 'application/json');
    const session = await getCurrentSession().catch(() => null);
    if (session?.accessToken) {
      headers.set('Authorization', `Bearer ${session.accessToken}`);
    }
    return headers;
  },
});

export const communityApi = createApi({
  reducerPath: 'communityApi',
  baseQuery: rawBaseQuery,
  tagTypes: ['Profile', 'Spaces', 'Posts', 'Post', 'Replies', 'Bookmarks', 'Notifications', 'Tags'],
  endpoints: (builder) => ({
    getMyProfile: builder.query<CommunityProfile, void>({
      query: () => '/me/profile',
      providesTags: ['Profile'],
    }),

    updateMyProfile: builder.mutation<
      CommunityProfile,
      { displayName?: string; bio?: string; countryId?: string; languages?: string[]; dialects?: string[] }
    >({
      query: (body) => ({ url: '/me/profile', method: 'PATCH', body }),
      invalidatesTags: ['Profile'],
    }),

    getUserProfile: builder.query<CommunityProfile, string>({
      query: (userId) => `/users/${userId}/profile`,
    }),

    listSpaces: builder.query<CommunitySpace[], void>({
      query: () => '/spaces',
      providesTags: ['Spaces'],
    }),

    getSpace: builder.query<CommunitySpace, string>({
      query: (slug) => `/spaces/${slug}`,
      providesTags: (_result, _error, slug) => [{ type: 'Spaces', id: slug }],
    }),

    joinSpace: builder.mutation<void, string>({
      query: (spaceId) => ({ url: `/spaces/${spaceId}/join`, method: 'POST' }),
      invalidatesTags: ['Spaces'],
    }),

    leaveSpace: builder.mutation<void, string>({
      query: (spaceId) => ({ url: `/spaces/${spaceId}/leave`, method: 'POST' }),
      invalidatesTags: ['Spaces'],
    }),

    listTags: builder.query<CommunityTag[], void>({
      query: () => '/tags',
      providesTags: ['Tags'],
    }),

    autocompleteTags: builder.query<CommunityTag[], string>({
      query: (q) => ({ url: '/tags/autocomplete', params: { q } }),
    }),

    listPosts: builder.query<
      CommunityPostPage,
      { tab?: CommunityFeedTab; spaceSlug?: string; tag?: string; cursor?: string }
    >({
      query: (params) => ({ url: '/posts', params }),
      providesTags: (result) =>
        result
          ? [...result.items.map((p) => ({ type: 'Posts' as const, id: p.id })), 'Posts']
          : ['Posts'],
    }),

    getPost: builder.query<CommunityPostCard, string>({
      query: (idOrSlug) => `/posts/${idOrSlug}`,
      providesTags: (_result, _error, idOrSlug) => [{ type: 'Post', id: idOrSlug }],
    }),

    createPost: builder.mutation<
      CommunityPostCard,
      { title: string; body: string; spaceId: string; tags?: string[] }
    >({
      query: (body) => ({ url: '/posts', method: 'POST', body }),
      invalidatesTags: ['Posts'],
    }),

    updatePost: builder.mutation<
      CommunityPostCard,
      { id: string; title?: string; body?: string; tags?: string[] }
    >({
      query: ({ id, ...body }) => ({ url: `/posts/${id}`, method: 'PATCH', body }),
      invalidatesTags: (_result, _error, { id }) => [{ type: 'Post', id }, 'Posts'],
    }),

    deletePost: builder.mutation<void, string>({
      query: (id) => ({ url: `/posts/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Posts'],
    }),

    listMyPosts: builder.query<CommunityPostPage, { cursor?: string } | void>({
      query: (params) => ({ url: '/me/posts', params: params ?? undefined }),
      providesTags: ['Posts'],
    }),

    listReplies: builder.query<CommunityReply[], string>({
      query: (postId) => `/posts/${postId}/replies`,
      providesTags: (_result, _error, postId) => [{ type: 'Replies', id: postId }],
    }),

    createReply: builder.mutation<
      CommunityReply,
      { postId: string; body: string; parentReplyId?: string }
    >({
      query: ({ postId, ...body }) => ({ url: `/posts/${postId}/replies`, method: 'POST', body }),
      invalidatesTags: (_result, _error, { postId }) => [
        { type: 'Replies', id: postId },
        { type: 'Post', id: postId },
        'Posts',
      ],
    }),

    updateReply: builder.mutation<CommunityReply, { id: string; postId: string; body: string }>({
      query: ({ id, body }) => ({ url: `/replies/${id}`, method: 'PATCH', body: { body } }),
      invalidatesTags: (_result, _error, { postId }) => [{ type: 'Replies', id: postId }],
    }),

    deleteReply: builder.mutation<void, { id: string; postId: string }>({
      query: ({ id }) => ({ url: `/replies/${id}`, method: 'DELETE' }),
      invalidatesTags: (_result, _error, { postId }) => [{ type: 'Replies', id: postId }],
    }),

    likePost: builder.mutation<void, string>({
      query: (postId) => ({ url: `/posts/${postId}/like`, method: 'POST' }),
      invalidatesTags: (_result, _error, postId) => [{ type: 'Post', id: postId }, 'Posts'],
    }),

    unlikePost: builder.mutation<void, string>({
      query: (postId) => ({ url: `/posts/${postId}/like`, method: 'DELETE' }),
      invalidatesTags: (_result, _error, postId) => [{ type: 'Post', id: postId }, 'Posts'],
    }),

    likeReply: builder.mutation<void, { id: string; postId: string }>({
      query: ({ id }) => ({ url: `/replies/${id}/like`, method: 'POST' }),
      invalidatesTags: (_result, _error, { postId }) => [{ type: 'Replies', id: postId }],
    }),

    unlikeReply: builder.mutation<void, { id: string; postId: string }>({
      query: ({ id }) => ({ url: `/replies/${id}/like`, method: 'DELETE' }),
      invalidatesTags: (_result, _error, { postId }) => [{ type: 'Replies', id: postId }],
    }),

    listBookmarks: builder.query<CommunityPostCard[], void>({
      query: () => '/bookmarks',
      providesTags: ['Bookmarks'],
    }),

    addBookmark: builder.mutation<void, string>({
      query: (postId) => ({ url: `/posts/${postId}/bookmark`, method: 'POST' }),
      invalidatesTags: ['Bookmarks'],
    }),

    removeBookmark: builder.mutation<void, string>({
      query: (postId) => ({ url: `/posts/${postId}/bookmark`, method: 'DELETE' }),
      invalidatesTags: ['Bookmarks'],
    }),

    listNotifications: builder.query<CommunityNotification[], void>({
      query: () => '/notifications',
      providesTags: ['Notifications'],
    }),

    markNotificationRead: builder.mutation<void, string>({
      query: (id) => ({ url: `/notifications/${id}/read`, method: 'POST' }),
      invalidatesTags: ['Notifications'],
    }),

    markAllNotificationsRead: builder.mutation<void, void>({
      query: () => ({ url: '/notifications/read-all', method: 'POST' }),
      invalidatesTags: ['Notifications'],
    }),

    fileReport: builder.mutation<void, CommunityReportReasonInput>({
      query: (body) => ({ url: '/reports', method: 'POST', body }),
    }),

    search: builder.query<CommunitySearchResults, string>({
      query: (q) => ({ url: '/search', params: { q } }),
    }),
  }),
});

export const {
  useGetMyProfileQuery,
  useUpdateMyProfileMutation,
  useGetUserProfileQuery,
  useListSpacesQuery,
  useGetSpaceQuery,
  useJoinSpaceMutation,
  useLeaveSpaceMutation,
  useListTagsQuery,
  useAutocompleteTagsQuery,
  useListPostsQuery,
  useGetPostQuery,
  useCreatePostMutation,
  useUpdatePostMutation,
  useDeletePostMutation,
  useListMyPostsQuery,
  useListRepliesQuery,
  useCreateReplyMutation,
  useUpdateReplyMutation,
  useDeleteReplyMutation,
  useLikePostMutation,
  useUnlikePostMutation,
  useLikeReplyMutation,
  useUnlikeReplyMutation,
  useListBookmarksQuery,
  useAddBookmarkMutation,
  useRemoveBookmarkMutation,
  useListNotificationsQuery,
  useMarkNotificationReadMutation,
  useMarkAllNotificationsReadMutation,
  useFileReportMutation,
  useSearchQuery,
} = communityApi;

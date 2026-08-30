import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import { PUBLIC_API_V1_BASE_URL } from '@/lib/public-api';
import { getCurrentSession } from '@/lib/client-session';
import type { SubscriberOrgRole } from '@/lib/api-client';

export interface SubscriberMe {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  emailVerifiedAt: string | null;
  memberships: {
    id: string;
    role: SubscriberOrgRole;
    organization: { id: string; name: string; slug: string };
  }[];
}

export interface SubscriptionPlan {
  id: string;
  key: string;
  name: string;
  monthlyUsdAmount: string;
  maxStreamDecks: number | null;
  maxTeamMembers: number | null;
  active: boolean;
}

export type SubscriptionStatus =
  | 'TRIAL'
  | 'ACTIVE'
  | 'PAST_DUE'
  | 'GRACE_PERIOD'
  | 'SUSPENDED'
  | 'CANCELED';

export interface Subscription {
  id: string;
  status: SubscriptionStatus;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  plan: SubscriptionPlan;
}

export interface SubscriberOrganization {
  id: string;
  name: string;
  slug: string;
  subscription: Subscription | null;
}

export interface SubscriberMember {
  id: string;
  role: SubscriberOrgRole;
  invitedAt: string;
  acceptedAt: string | null;
  user: { id: string; email: string; firstName: string; lastName: string };
}

export type IsvcConfidence = 'EMERGING' | 'ESTABLISHED' | 'HIGH' | 'VERY_HIGH';

export interface CatalogueRecording {
  recordingId: string;
  dialectTag: string;
  durationMs: number | null;
  dlCanonicalScore: string | null;
  rawScore: string | null;
  compositeScore: string | null;
  noiseScore: string | null;
  qualityScore: string | null;
  livenessScore: string | null;
  country: { code: string; name: string } | null;
  dialect: { tag: string; name: string } | null;
  subdialect: { tag: string; name: string } | null;
  createdAt: string;
  isvs: string | null;
  isvcConfidence: IsvcConfidence | null;
  isvcOrganizationCount: number | null;
  isvcAgreement: string | null;
}

export interface ValidationDimensions {
  transcriptAccuracy: number;
  pronunciationAccuracy: number;
  dialectAuthenticity: number;
  speechClarity: number;
  audioQuality: number;
  overallScore: number;
  notes?: string;
}

export interface SubscriberValidation extends ValidationDimensions {
  id: string;
  organizationId: string;
  userId: string;
  recordingId: string;
  createdAt: string;
  user?: { firstName: string; lastName: string; email: string };
}

export interface OrgContribution {
  recordingsValidated: number;
  totalValidations: number;
}

export interface CataloguePage {
  items: CatalogueRecording[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface StreamDeckItem {
  id: string;
  recordingId: string;
  addedByUserId: string;
  addedAt: string;
}

export interface StreamDeck {
  id: string;
  deckKey: string;
  name: string;
  createdByUserId: string;
  createdAt: string;
  _count?: { items: number };
  items?: StreamDeckItem[];
}

const rawBaseQuery = fetchBaseQuery({
  baseUrl: `${PUBLIC_API_V1_BASE_URL}/voice-stream`,
  prepareHeaders: async (headers) => {
    headers.set('Content-Type', 'application/json');
    const session = await getCurrentSession().catch(() => null);
    if (session?.accessToken) {
      headers.set('Authorization', `Bearer ${session.accessToken}`);
    }
    return headers;
  },
});

export const streamApi = createApi({
  reducerPath: 'streamApi',
  baseQuery: rawBaseQuery,
  tagTypes: ['Me', 'Organization', 'Members', 'Subscription', 'StreamDecks', 'Validations'],
  endpoints: (builder) => ({
    getMe: builder.query<SubscriberMe, void>({
      query: () => '/me',
      providesTags: ['Me'],
    }),

    getOrganization: builder.query<SubscriberOrganization, void>({
      query: () => '/organization',
      providesTags: ['Organization'],
    }),

    updateOrganization: builder.mutation<SubscriberOrganization, { name?: string }>({
      query: (body) => ({ url: '/organization', method: 'PATCH', body }),
      invalidatesTags: ['Organization'],
    }),

    listMembers: builder.query<SubscriberMember[], void>({
      query: () => '/organization/members',
      providesTags: ['Members'],
    }),

    updateMemberRole: builder.mutation<SubscriberMember, { id: string; role: SubscriberOrgRole }>({
      query: ({ id, role }) => ({
        url: `/organization/members/${id}`,
        method: 'PATCH',
        body: { role },
      }),
      invalidatesTags: ['Members'],
    }),

    removeMember: builder.mutation<void, string>({
      query: (id) => ({ url: `/organization/members/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Members'],
    }),

    inviteMember: builder.mutation<void, { email: string; role: SubscriberOrgRole }>({
      query: (body) => ({ url: '/auth/invites', method: 'POST', body }),
      invalidatesTags: ['Members'],
    }),

    getSubscription: builder.query<Subscription | null, void>({
      query: () => '/billing/subscription',
      providesTags: ['Subscription'],
    }),

    createCheckoutSession: builder.mutation<{ checkoutUrl: string }, { planKey: string }>({
      query: (body) => ({ url: '/billing/checkout-session', method: 'POST', body }),
    }),

    searchCatalogue: builder.query<
      CataloguePage,
      {
        countryCode?: string;
        dialectTag?: string;
        minScore?: number;
        minIsvs?: number;
        minConfidence?: IsvcConfidence;
        page?: number;
        pageSize?: number;
      }
    >({
      query: (params) => ({ url: '/catalogue/search', params }),
    }),

    previewRecording: builder.mutation<{ url: string; expiresInSeconds: number }, string>({
      query: (recordingId) => ({ url: `/catalogue/${recordingId}/preview`, method: 'GET' }),
    }),

    submitValidation: builder.mutation<
      SubscriberValidation,
      { recordingId: string; dto: ValidationDimensions }
    >({
      query: ({ recordingId, dto }) => ({
        url: `/isvp/recordings/${recordingId}`,
        method: 'POST',
        body: dto,
      }),
      invalidatesTags: ['Validations'],
    }),

    getMyValidationsForRecording: builder.query<SubscriberValidation[], string>({
      query: (recordingId) => `/isvp/recordings/${recordingId}/mine`,
      providesTags: ['Validations'],
    }),

    listMyValidations: builder.query<SubscriberValidation[], void>({
      query: () => '/isvp/mine',
      providesTags: ['Validations'],
    }),

    getOrgContribution: builder.query<OrgContribution, void>({
      query: () => '/isvp/contribution',
      providesTags: ['Validations'],
    }),

    listStreamDecks: builder.query<StreamDeck[], void>({
      query: () => '/stream-decks',
      providesTags: ['StreamDecks'],
    }),

    getStreamDeck: builder.query<StreamDeck, string>({
      query: (id) => `/stream-decks/${id}`,
      providesTags: (_result, _error, id) => [{ type: 'StreamDecks', id }],
    }),

    createStreamDeck: builder.mutation<
      StreamDeck,
      { name: string; countryCode?: string; dialectTag?: string; subdialectTag?: string }
    >({
      query: (body) => ({ url: '/stream-decks', method: 'POST', body }),
      invalidatesTags: ['StreamDecks'],
    }),

    renameStreamDeck: builder.mutation<StreamDeck, { id: string; name: string }>({
      query: ({ id, name }) => ({ url: `/stream-decks/${id}`, method: 'PATCH', body: { name } }),
      invalidatesTags: ['StreamDecks'],
    }),

    deleteStreamDeck: builder.mutation<void, string>({
      query: (id) => ({ url: `/stream-decks/${id}`, method: 'DELETE' }),
      invalidatesTags: ['StreamDecks'],
    }),

    addStreamDeckItem: builder.mutation<StreamDeckItem, { deckId: string; recordingId: string }>({
      query: ({ deckId, recordingId }) => ({
        url: `/stream-decks/${deckId}/items`,
        method: 'POST',
        body: { recordingId },
      }),
      invalidatesTags: (_result, _error, { deckId }) => [{ type: 'StreamDecks', id: deckId }],
    }),

    removeStreamDeckItem: builder.mutation<void, { deckId: string; itemId: string }>({
      query: ({ deckId, itemId }) => ({
        url: `/stream-decks/${deckId}/items/${itemId}`,
        method: 'DELETE',
      }),
      invalidatesTags: (_result, _error, { deckId }) => [{ type: 'StreamDecks', id: deckId }],
    }),
  }),
});

export const {
  useGetMeQuery,
  useGetOrganizationQuery,
  useUpdateOrganizationMutation,
  useListMembersQuery,
  useUpdateMemberRoleMutation,
  useRemoveMemberMutation,
  useInviteMemberMutation,
  useGetSubscriptionQuery,
  useCreateCheckoutSessionMutation,
  useSearchCatalogueQuery,
  usePreviewRecordingMutation,
  useSubmitValidationMutation,
  useGetMyValidationsForRecordingQuery,
  useListMyValidationsQuery,
  useGetOrgContributionQuery,
  useListStreamDecksQuery,
  useGetStreamDeckQuery,
  useCreateStreamDeckMutation,
  useRenameStreamDeckMutation,
  useDeleteStreamDeckMutation,
  useAddStreamDeckItemMutation,
  useRemoveStreamDeckItemMutation,
} = streamApi;

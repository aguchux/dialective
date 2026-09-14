import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import { PUBLIC_API_V1_BASE_URL } from '@/lib/public-api';
import { getCurrentSession } from '@/lib/client-session';
import type { SubscriberOrgRole } from '@/lib/api-client';
import { buildCatalogueShowcase } from '@/components/stream-catalogue/mock-data';
import type { CatalogueShowcase } from '@/components/stream-catalogue/types';

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
  enterpriseSecurityPoliciesEnabled: boolean;
  features: string[];
  active: boolean;
}

export interface BillingUsage {
  periodStart: string;
  bytesUsed: string;
  requestsUsed: number;
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
  website: string | null;
  industry: string | null;
  description: string | null;
  supportEmail: string | null;
  companySize: string | null;
  subscription: Subscription | null;
}

export interface UpdateOrganizationInput {
  name?: string;
  website?: string;
  industry?: string;
  description?: string;
  supportEmail?: string;
  companySize?: string;
}

export interface SecurityPolicy {
  id: string;
  organizationId: string;
  requireSso: boolean;
  refreshTokenTtlMinutes: number | null;
  minRoleForApiKeyCreation: SubscriberOrgRole[];
  requireIpAllowlist: boolean;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertSecurityPolicyInput {
  requireSso?: boolean;
  refreshTokenTtlMinutes?: number | null;
  minRoleForApiKeyCreation?: SubscriberOrgRole[];
  requireIpAllowlist?: boolean;
}

export interface PendingInvite {
  id: string;
  email: string;
  role: SubscriberOrgRole;
  invitedByUserId: string;
  expiresAt: string;
  createdAt: string;
}

export type OrgActivityEventType =
  | 'KEY_CREATED'
  | 'KEY_ROTATED'
  | 'KEY_REVOKED'
  | 'OAUTH_CLIENT_CREATED'
  | 'OAUTH_CLIENT_REVOKED'
  | 'MEMBER_INVITED'
  | 'MEMBER_ROLE_CHANGED'
  | 'MEMBER_REMOVED'
  | 'SUBSCRIPTION_PLAN_CHANGED'
  | 'DECK_CREATED'
  | 'DECK_RENAMED'
  | 'DECK_DELETED'
  | 'DECK_ITEM_ADDED'
  | 'DECK_ITEM_REMOVED'
  | 'DECK_VISIBILITY_CHANGED'
  | 'SSO_CONFIGURED'
  | 'SSO_DISABLED'
  | 'SSO_LOGIN'
  | 'SECURITY_POLICY_UPDATED'
  | 'SECURITY_POLICY_REMOVED';

export interface OrgActivityEvent {
  id: string;
  organizationId: string;
  eventType: OrgActivityEventType;
  actorUserId: string | null;
  actor: { id: string; firstName: string; lastName: string; email: string } | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface SubscriberMember {
  id: string;
  role: SubscriberOrgRole;
  invitedAt: string;
  acceptedAt: string | null;
  user: { id: string; email: string; firstName: string; lastName: string };
}

export type IsvcConfidence = 'EMERGING' | 'ESTABLISHED' | 'HIGH' | 'VERY_HIGH';
export type QualityTier = 'standard' | 'high' | 'premium_verified';

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
  qualityTier: QualityTier;
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

export type ValidationReviewStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface SubscriberValidation extends ValidationDimensions {
  id: string;
  organizationId: string;
  userId: string;
  recordingId: string;
  createdAt: string;
  status: ValidationReviewStatus;
  reviewedByUserId: string | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
  user?: { firstName: string; lastName: string; email: string };
}

export type ValidationAuditAction = 'SUBMITTED' | 'RESUBMITTED' | 'APPROVED' | 'REJECTED';

export interface ValidationAuditLogEntry {
  id: string;
  validationId: string;
  action: ValidationAuditAction;
  actorUserId: string;
  reason: string | null;
  createdAt: string;
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

export type StreamDeckType = 'MANUAL' | 'SMART';

export interface StreamDeckRule {
  countryCode: string | null;
  dialectTag: string | null;
  subdialectTag: string | null;
  minScore: number | null;
  minIsvs: number | null;
  minConfidence: IsvcConfidence | null;
  minOrganizationCount: number | null;
  minAudioQuality: number | null;
}

export interface StreamDeckRuleInput {
  countryCode?: string;
  dialectTag?: string;
  subdialectTag?: string;
  minScore?: number;
  minIsvs?: number;
  minConfidence?: IsvcConfidence;
  minOrganizationCount?: number;
  minAudioQuality?: number;
}

export interface StreamDeckVersion {
  version: number;
  itemCount: number;
  createdAt: string;
  createdReason: string;
}

export type StreamDeckVisibility = 'PRIVATE' | 'PUBLIC';

export interface DeckLicense {
  termsSummary: string;
  attributionRequired: boolean;
  redistributionAllowed: boolean;
}

export interface StreamDeck {
  id: string;
  deckKey: string;
  name: string;
  type: StreamDeckType;
  visibility: StreamDeckVisibility;
  rule?: StreamDeckRule | null;
  license?: DeckLicense | null;
  createdByUserId: string;
  createdAt: string;
  _count?: { items: number };
  items?: StreamDeckItem[];
}

export interface PublicDeckSummary {
  id: string;
  deckKey: string;
  name: string;
  organizationName: string;
  itemCount: number;
  createdAt: string;
  hasLicense: boolean;
  licenseAccepted: boolean;
  license: DeckLicense | null;
  minQualityTier: QualityTier;
  tierBreakdown: Record<QualityTier, number>;
}

export interface ValidationQueueItem {
  id: string;
  organizationId: string;
  recordingId: string;
  sourceDeckId: string | null;
  addedByUserId: string;
  addedAt: string;
}

export type StreamKeyScope =
  | 'DECK_READ'
  | 'DECK_LIST'
  | 'AUDIO_STREAM'
  | 'METADATA_READ'
  | 'MANIFEST_READ'
  | 'USAGE_READ';

export interface StreamApiKeySummary {
  id: string;
  organizationId: string;
  deckId: string | null;
  keyPrefix: string;
  scopes: StreamKeyScope[];
  allowedIps: string[];
  createdByUserId: string;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
}

export interface CreatedStreamApiKey extends StreamApiKeySummary {
  plaintextKey: string;
}

export interface CreateStreamKeyInput {
  deckId?: string;
  scopes: StreamKeyScope[];
  allowedIps?: string[];
  expiresAt?: string;
}

export interface OAuthClientSummary {
  id: string;
  organizationId: string;
  deckId: string | null;
  clientId: string;
  scopes: StreamKeyScope[];
  createdByUserId: string;
  createdAt: string;
  revokedAt: string | null;
}

export interface CreatedOAuthClient extends OAuthClientSummary {
  plaintextSecret: string;
}

export interface CreateOAuthClientInput {
  deckId?: string;
  scopes: StreamKeyScope[];
}

export type WebhookEventType =
  | 'SUBSCRIBER_CREATED'
  | 'SUBSCRIPTION_ACTIVATED'
  | 'SUBSCRIPTION_PAYMENT_FAILED'
  | 'DECK_CREATED'
  | 'DECK_ITEM_ADDED'
  | 'DECK_ITEM_REMOVED'
  | 'DECK_VERSION_CREATED'
  | 'VALIDATION_SUBMITTED'
  | 'ISVC_VERSION_CREATED'
  | 'API_KEY_CREATED'
  | 'API_KEY_REVOKED'
  | 'AUDIO_STREAM_COMPLETED'
  | 'AUDIO_STREAM_DENIED';

export interface WebhookSubscriptionSummary {
  id: string;
  organizationId: string;
  url: string;
  eventTypes: WebhookEventType[];
  active: boolean;
  createdByUserId: string;
  createdAt: string;
}

export interface CreatedWebhookSubscription extends WebhookSubscriptionSummary {
  plaintextSecret: string;
}

export interface CreateWebhookSubscriptionInput {
  url: string;
  eventTypes: WebhookEventType[];
}

export interface WebhookDeliveryLogEntry {
  id: string;
  subscriptionId: string;
  eventType: WebhookEventType;
  attemptNumber: number;
  resultCode: number | null;
  succeeded: boolean;
  errorMessage: string | null;
  createdAt: string;
}

export interface DatasetQualityReport {
  totalEligibleRecordings: number;
  tierCounts: Record<QualityTier, number>;
  confidenceCounts: Record<string, number>;
  meanIsvs: number | null;
  meanAgreement: number | null;
  rows: Record<string, unknown>[];
}

export interface SubscriberAnalyticsReport {
  totalRequests: number;
  audioRequests: number;
  totalBytesStreamed: string;
  totalHoursStreamed: number;
  deniedRequestRate: number;
  successRate: number;
  requestsByType: Record<string, number>;
  topDecksByRequests: { deckId: string | null; requests: number }[];
  rows: {
    createdAt: string;
    deckId: string | null;
    recordingId: string | null;
    bytesStreamed: string;
    resultCode: number;
    entitlementDecision: string;
  }[];
}

export interface SubscriberAnalyticsTimeSeriesPoint {
  date: string;
  successfulRequests: number;
  failedRequests: number;
}

export interface ValidationContributionReport {
  totalRecordingsValidated: number;
  averageValidatorCount: number | null;
  averageMeanScore: number | null;
  byDialect: Record<string, number>;
  rows: Record<string, unknown>[];
}

export interface ProvenanceReport {
  deckId: string;
  deckKey: string;
  version: number;
  itemCount: number;
  createdAt: string;
  createdReason: string;
  rows: Record<string, unknown>[];
}

export interface AnomalyEventEntry {
  createdAt: string;
  ruleKey: string;
  windowStart: string;
  windowEnd: string;
  details: Record<string, unknown>;
}

// See frontend/store/api.ts's identical constant for why this exists --
// same fix, same rationale, applied to this app's separate RTK Query
// client so a hung request here (e.g. during an API deploy) also fails
// visibly instead of spinning forever.
const REQUEST_TIMEOUT_MS = 20_000;

const rawBaseQuery = fetchBaseQuery({
  baseUrl: `${PUBLIC_API_V1_BASE_URL}/voice-stream`,
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

export const streamApi = createApi({
  reducerPath: 'streamApi',
  baseQuery: rawBaseQuery,
  tagTypes: [
    'Me',
    'Organization',
    'Members',
    'Invites',
    'Activity',
    'Subscription',
    'StreamDecks',
    'Validations',
    'StreamKeys',
    'Webhooks',
    'Reports',
    'OAuthClients',
    'PublicDecks',
    'ValidationQueue',
    'CatalogueShowcase',
    'BillingUsage',
    'SecurityPolicy',
  ],
  endpoints: (builder) => ({
    getMe: builder.query<SubscriberMe, void>({
      query: () => '/me',
      providesTags: ['Me'],
    }),

    getOrganization: builder.query<SubscriberOrganization, void>({
      query: () => '/organization',
      providesTags: ['Organization'],
    }),

    updateOrganization: builder.mutation<SubscriberOrganization, UpdateOrganizationInput>({
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
      invalidatesTags: ['Members', 'Activity'],
    }),

    removeMember: builder.mutation<void, string>({
      query: (id) => ({ url: `/organization/members/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Members', 'Activity'],
    }),

    inviteMember: builder.mutation<void, { email: string; role: SubscriberOrgRole }>({
      query: (body) => ({ url: '/auth/invites', method: 'POST', body }),
      invalidatesTags: ['Members', 'Invites'],
    }),

    listPendingInvites: builder.query<PendingInvite[], void>({
      query: () => '/organization/invites',
      providesTags: ['Invites'],
    }),

    listOrgActivity: builder.query<OrgActivityEvent[], void>({
      query: () => '/organization/activity',
      providesTags: ['Activity'],
    }),

    getSubscription: builder.query<Subscription | null, void>({
      query: () => '/billing/subscription',
      providesTags: ['Subscription'],
    }),

    createCheckoutSession: builder.mutation<{ checkoutUrl?: string; activated?: true }, { planKey: string }>({
      query: (body) => ({ url: '/billing/checkout-session', method: 'POST', body }),
    }),

    getBillingUsage: builder.query<BillingUsage, void>({
      query: () => '/billing/usage',
      providesTags: ['BillingUsage'],
    }),

    getSecurityPolicy: builder.query<SecurityPolicy | null, void>({
      query: () => '/security-policy',
      providesTags: ['SecurityPolicy'],
    }),

    upsertSecurityPolicy: builder.mutation<SecurityPolicy, UpsertSecurityPolicyInput>({
      query: (body) => ({ url: '/security-policy', method: 'POST', body }),
      invalidatesTags: ['SecurityPolicy', 'Activity'],
    }),

    removeSecurityPolicy: builder.mutation<void, void>({
      query: () => ({ url: '/security-policy', method: 'DELETE' }),
      invalidatesTags: ['SecurityPolicy', 'Activity'],
    }),

    searchCatalogue: builder.query<
      CataloguePage,
      {
        countryCode?: string;
        dialectTag?: string;
        minScore?: number;
        minIsvs?: number;
        minConfidence?: IsvcConfidence;
        sortBy?: 'newest' | 'isvs_desc';
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

    listValidationQueue: builder.query<SubscriberValidation[], void>({
      query: () => '/isvp/queue',
      providesTags: ['Validations'],
    }),

    approveValidation: builder.mutation<SubscriberValidation, string>({
      query: (validationId) => ({ url: `/isvp/${validationId}/approve`, method: 'POST' }),
      invalidatesTags: ['Validations'],
    }),

    rejectValidation: builder.mutation<SubscriberValidation, { validationId: string; reason: string }>({
      query: ({ validationId, reason }) => ({
        url: `/isvp/${validationId}/reject`,
        method: 'POST',
        body: { reason },
      }),
      invalidatesTags: ['Validations'],
    }),

    getValidationAuditLog: builder.query<ValidationAuditLogEntry[], string>({
      query: (validationId) => `/isvp/${validationId}/audit-log`,
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
      {
        name: string;
        type?: StreamDeckType;
        countryCode?: string;
        dialectTag?: string;
        subdialectTag?: string;
        rule?: StreamDeckRuleInput;
      }
    >({
      query: (body) => ({ url: '/stream-decks', method: 'POST', body }),
      invalidatesTags: ['StreamDecks'],
    }),

    updateStreamDeckRule: builder.mutation<StreamDeck, { id: string; rule: StreamDeckRuleInput }>({
      query: ({ id, rule }) => ({ url: `/stream-decks/${id}/rule`, method: 'PATCH', body: rule }),
      invalidatesTags: (_result, _error, { id }) => [{ type: 'StreamDecks', id }],
    }),

    listStreamDeckVersions: builder.query<StreamDeckVersion[], string>({
      query: (id) => `/stream-decks/${id}/versions`,
      providesTags: (_result, _error, id) => [{ type: 'StreamDecks', id: `${id}-versions` }],
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

    setStreamDeckVisibility: builder.mutation<StreamDeck, { id: string; visibility: StreamDeckVisibility }>({
      query: ({ id, visibility }) => ({
        url: `/stream-decks/${id}/visibility`,
        method: 'PATCH',
        body: { visibility },
      }),
      invalidatesTags: (_result, _error, { id }) => [{ type: 'StreamDecks', id }, 'PublicDecks'],
    }),

    setStreamDeckLicense: builder.mutation<
      DeckLicense,
      { id: string; termsSummary: string; attributionRequired?: boolean; redistributionAllowed?: boolean }
    >({
      query: ({ id, ...body }) => ({ url: `/stream-decks/${id}/license`, method: 'POST', body }),
      invalidatesTags: (_result, _error, { id }) => [{ type: 'StreamDecks', id }, 'PublicDecks'],
    }),

    removeStreamDeckLicense: builder.mutation<void, string>({
      query: (id) => ({ url: `/stream-decks/${id}/license`, method: 'DELETE' }),
      invalidatesTags: (_result, _error, id) => [{ type: 'StreamDecks', id }, 'PublicDecks'],
    }),

    listPublicDecks: builder.query<PublicDeckSummary[], { minQualityTier?: QualityTier } | void>({
      query: (params) => ({ url: '/public-decks', params: params ?? undefined }),
      providesTags: ['PublicDecks'],
    }),

    acceptPublicDeckLicense: builder.mutation<{ id: string }, string>({
      query: (id) => ({ url: `/public-decks/${id}/accept-license`, method: 'POST' }),
      invalidatesTags: ['PublicDecks'],
    }),

    copyPublicDeckToMine: builder.mutation<StreamDeck, { id: string; newDeckName: string }>({
      query: ({ id, newDeckName }) => ({
        url: `/public-decks/${id}/copy-to-mine`,
        method: 'POST',
        body: { newDeckName },
      }),
      invalidatesTags: ['StreamDecks'],
    }),

    importPublicDeckToValidationQueue: builder.mutation<{ queued: number; alreadyQueued: number }, string>({
      query: (id) => ({ url: `/public-decks/${id}/import-to-validation-queue`, method: 'POST' }),
      invalidatesTags: ['ValidationQueue'],
    }),

    listValidationShortlist: builder.query<ValidationQueueItem[], void>({
      query: () => '/public-decks/validation-queue',
      providesTags: ['ValidationQueue'],
    }),

    removeFromValidationShortlist: builder.mutation<void, string>({
      query: (itemId) => ({ url: `/public-decks/validation-queue/${itemId}`, method: 'DELETE' }),
      invalidatesTags: ['ValidationQueue'],
    }),

    listStreamKeys: builder.query<StreamApiKeySummary[], void>({
      query: () => '/stream-keys',
      providesTags: ['StreamKeys'],
    }),

    createStreamKey: builder.mutation<CreatedStreamApiKey, CreateStreamKeyInput>({
      query: (body) => ({ url: '/stream-keys', method: 'POST', body }),
      invalidatesTags: ['StreamKeys'],
    }),

    rotateStreamKey: builder.mutation<CreatedStreamApiKey, string>({
      query: (id) => ({ url: `/stream-keys/${id}/rotate`, method: 'POST' }),
      invalidatesTags: ['StreamKeys'],
    }),

    revokeStreamKey: builder.mutation<StreamApiKeySummary, string>({
      query: (id) => ({ url: `/stream-keys/${id}`, method: 'DELETE' }),
      invalidatesTags: ['StreamKeys'],
    }),

    listOAuthClients: builder.query<OAuthClientSummary[], void>({
      query: () => '/oauth/clients',
      providesTags: ['OAuthClients'],
    }),

    createOAuthClient: builder.mutation<CreatedOAuthClient, CreateOAuthClientInput>({
      query: (body) => ({ url: '/oauth/clients', method: 'POST', body }),
      invalidatesTags: ['OAuthClients'],
    }),

    revokeOAuthClient: builder.mutation<OAuthClientSummary, string>({
      query: (id) => ({ url: `/oauth/clients/${id}`, method: 'DELETE' }),
      invalidatesTags: ['OAuthClients'],
    }),

    listWebhooks: builder.query<WebhookSubscriptionSummary[], void>({
      query: () => '/webhooks',
      providesTags: ['Webhooks'],
    }),

    createWebhook: builder.mutation<CreatedWebhookSubscription, CreateWebhookSubscriptionInput>({
      query: (body) => ({ url: '/webhooks', method: 'POST', body }),
      invalidatesTags: ['Webhooks'],
    }),

    deleteWebhook: builder.mutation<{ removed: boolean }, string>({
      query: (id) => ({ url: `/webhooks/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Webhooks'],
    }),

    listWebhookDeliveries: builder.query<WebhookDeliveryLogEntry[], string>({
      query: (id) => `/webhooks/${id}/deliveries`,
      providesTags: (_result, _error, id) => [{ type: 'Webhooks', id: `${id}-deliveries` }],
    }),

    getDatasetQualityReport: builder.query<DatasetQualityReport, void>({
      query: () => '/reports/dataset-quality',
      providesTags: ['Reports'],
    }),

    getSubscriberAnalyticsReport: builder.query<
      SubscriberAnalyticsReport,
      { from?: string; to?: string } | void
    >({
      query: (params) => ({ url: '/reports/subscriber-analytics', params: params ?? undefined }),
      providesTags: ['Reports'],
    }),

    getSubscriberAnalyticsTimeSeries: builder.query<
      SubscriberAnalyticsTimeSeriesPoint[],
      { from: string; to: string }
    >({
      query: (params) => ({ url: '/reports/subscriber-analytics/time-series', params }),
      providesTags: ['Reports'],
    }),

    getValidationContributionReport: builder.query<ValidationContributionReport, void>({
      query: () => '/reports/validation-contributions',
      providesTags: ['Reports'],
    }),

    getProvenanceReport: builder.query<ProvenanceReport, { deckId: string; version: number }>({
      query: ({ deckId, version }) => `/reports/provenance/${deckId}/${version}`,
      providesTags: ['Reports'],
    }),

    getAnomalyEvents: builder.query<{ rows: AnomalyEventEntry[] }, void>({
      query: () => '/reports/anomalies',
      providesTags: ['Reports'],
    }),

    // Public marketing/discovery catalogue shown on the unauthenticated
    // landing page. No backend endpoint exists for this yet -- queryFn
    // stands in for one so the page consumes RTK Query's cache/loading/
    // refetch lifecycle exactly like the real endpoints above, and can be
    // swapped for a real `query:` call later without touching call sites.
    getCatalogueShowcase: builder.query<CatalogueShowcase, void>({
      queryFn: async () => {
        await new Promise((resolve) => setTimeout(resolve, 450));
        return { data: buildCatalogueShowcase() };
      },
      providesTags: ['CatalogueShowcase'],
      keepUnusedDataFor: 300,
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
  useListPendingInvitesQuery,
  useListOrgActivityQuery,
  useGetSubscriptionQuery,
  useCreateCheckoutSessionMutation,
  useGetBillingUsageQuery,
  useGetSecurityPolicyQuery,
  useUpsertSecurityPolicyMutation,
  useRemoveSecurityPolicyMutation,
  useSearchCatalogueQuery,
  usePreviewRecordingMutation,
  useSubmitValidationMutation,
  useGetMyValidationsForRecordingQuery,
  useListMyValidationsQuery,
  useGetOrgContributionQuery,
  useListValidationQueueQuery,
  useApproveValidationMutation,
  useRejectValidationMutation,
  useGetValidationAuditLogQuery,
  useListStreamDecksQuery,
  useGetStreamDeckQuery,
  useCreateStreamDeckMutation,
  useUpdateStreamDeckRuleMutation,
  useListStreamDeckVersionsQuery,
  useRenameStreamDeckMutation,
  useDeleteStreamDeckMutation,
  useAddStreamDeckItemMutation,
  useRemoveStreamDeckItemMutation,
  useSetStreamDeckVisibilityMutation,
  useSetStreamDeckLicenseMutation,
  useRemoveStreamDeckLicenseMutation,
  useListPublicDecksQuery,
  useAcceptPublicDeckLicenseMutation,
  useCopyPublicDeckToMineMutation,
  useImportPublicDeckToValidationQueueMutation,
  useListValidationShortlistQuery,
  useRemoveFromValidationShortlistMutation,
  useListStreamKeysQuery,
  useCreateStreamKeyMutation,
  useRotateStreamKeyMutation,
  useRevokeStreamKeyMutation,
  useListOAuthClientsQuery,
  useCreateOAuthClientMutation,
  useRevokeOAuthClientMutation,
  useListWebhooksQuery,
  useCreateWebhookMutation,
  useDeleteWebhookMutation,
  useListWebhookDeliveriesQuery,
  useGetDatasetQualityReportQuery,
  useGetSubscriberAnalyticsReportQuery,
  useGetSubscriberAnalyticsTimeSeriesQuery,
  useGetValidationContributionReportQuery,
  useGetProvenanceReportQuery,
  useGetAnomalyEventsQuery,
  useGetCatalogueShowcaseQuery,
} = streamApi;

import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import { PUBLIC_API_V1_BASE_URL } from '@/lib/public-api';
import { getCurrentSession } from '@/lib/client-session';

export interface PublicUser {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  role: 'TRAINER' | 'ADMIN' | 'PARTNER';
  status: 'ACTIVE' | 'SUSPENDED' | 'BLOCKED';
  emailVerified: boolean;
  countryId: string | null;
  dialectId: string | null;
  dialectTag: string | null;
  onboardingComplete: boolean;
  referralCode: string;
}

export interface PendingOtp {
  otpRequired: true;
  ticket: string;
  expiresInSeconds: number;
}

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: PublicUser;
}

export interface Country {
  id: string;
  code: string;
  name: string;
}

export interface Dialect {
  id: string;
  tag: string;
  name: string;
}

export interface AdminCountry {
  id: string;
  code: string;
  name: string;
  llmGenerationEnabled: boolean;
  _count: { dialects: number; users: number };
}

export interface AdminDialect {
  id: string;
  tag: string;
  name: string;
  countryId: string;
  llmGenerationEnabled: boolean;
  country: { id: string; name: string; code: string };
  _count: { users: number };
}

export interface CountryInput {
  code: string;
  name: string;
  llmGenerationEnabled?: boolean;
}

export interface DialectInput {
  tag: string;
  name: string;
  countryId: string;
  llmGenerationEnabled?: boolean;
}

export interface DataAccessLeadInput {
  name: string;
  email: string;
  organization: string;
  website: string;
  countriesInterested: string;
}

export interface AdminDataAccessLead {
  id: string;
  name: string;
  email: string;
  organization: string | null;
  website: string | null;
  countriesInterested: string | null;
  contactedAt: string | null;
  contactNote: string | null;
  contactedByUserId: string | null;
  contactedBy: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  } | null;
  createdAt: string;
}

export interface DataAccessLeadsPage {
  items: AdminDataAccessLead[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface DataAccessLeadContactUpdateInput {
  contacted: boolean;
  note?: string;
}

export interface ReferralSettings {
  id: string;
  fundingBonusRate: string;
  fundingBonusEnabled: boolean;
  payoutBonusRate: string;
  payoutBonusEnabled: boolean;
  updatedAt: string;
  createdAt: string;
}

export interface ReferralSettingsInput {
  fundingBonusRate?: number;
  fundingBonusEnabled?: boolean;
  payoutBonusRate?: number;
  payoutBonusEnabled?: boolean;
}

export interface ReferralSummary {
  referrerEmail: string | null;
  referralCode: string | null;
  referredUsers: { id: string; email: string; createdAt: string }[];
  totalCommission: string;
  bonusEventCount: number;
}

export interface Wallet {
  balance: string;
  lockedBalance: string;
  tokenUsdRate: number;
  taskTokenCost: string;
}

export type LedgerEntryType =
  | 'DEPOSIT'
  | 'TRAINING_PAYOUT'
  | 'TASK_LOCK'
  | 'TASK_REFUND'
  | 'WITHDRAWAL'
  | 'WITHDRAWAL_REVERSED'
  | 'REFERRAL_COMMISSION'
  | 'REFERRAL_FUNDING_BONUS'
  | 'REFERRAL_PAYOUT_BONUS';

export interface TrainerDashboardSummary {
  balance: string;
  lockedBalance: string;
  tokenUsdRate: number;
  taskTokenCost: string;
  scoringSlaMinutes: number;
  fundedTokens: string;
  trainingEarningsTokens: string;
  referralEarningsTokens: string;
  paidOutTokens: string;
  pendingPayoutTokens: string;
  recentActivity: {
    id: string;
    type: LedgerEntryType;
    amount: string;
    reference: string;
    createdAt: string;
  }[];
  monthlyEarnings: { month: string; amount: string }[];
  referrals: {
    code: string;
    invitedCount: number;
    recentInvites: { id: string; email: string; createdAt: string }[];
    fundingBonusRate: string;
    fundingBonusEnabled: boolean;
    payoutBonusRate: string;
    payoutBonusEnabled: boolean;
  };
}

export type EarningsChartRange = 'week' | 'month' | 'year';

export interface EarningsChart {
  range: EarningsChartRange;
  buckets: { label: string; amount: string }[];
}

export interface EarningHistoryPage {
  items: {
    id: string;
    type: Extract<
      LedgerEntryType,
      'TRAINING_PAYOUT' | 'REFERRAL_COMMISSION' | 'REFERRAL_FUNDING_BONUS' | 'REFERRAL_PAYOUT_BONUS'
    >;
    amount: string;
    reference: string;
    createdAt: string;
  }[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface AdminStats {
  totalUsers: number;
  totalTrainers: number;
  totalAdmins: number;
  activeUsers: number;
  suspendedUsers: number;
  verifiedUsers: number;
  referralSettings: {
    fundingBonusRate: string;
    fundingBonusEnabled: boolean;
    payoutBonusRate: string;
    payoutBonusEnabled: boolean;
  };
  pendingWithdrawals: number;
  pendingWithdrawalTokens: string;
  pendingWithdrawalUsdt: string;
  dataAccessLeads: number;
  countriesCount: number;
  dialectsCount: number;
  wordsCount: number;
  wordTranslationsCount: number;
  promptsCount: number;
  activePromptsCount: number;
  promptTranslationsCount: number;
  trainingSessionsCount: number;
  wordRecordingsCount: number;
  wordRecordingsPending: number;
  wordRecordingsScored: number;
  wordRecordingsSettled: number;
  submissionsCount: number;
  submissionsPending: number;
  submissionsTranscribed: number;
  submissionsScored: number;
  submissionsSettled: number;
  submissionsRejected: number;
  walletsCount: number;
  totalWalletBalance: string;
  totalLockedTokens: string;
  totalDepositsUsd: string;
  totalTokensFunded: string;
  pendingDeposits: number;
  confirmedDeposits: number;
  ipnEventsCount: number;
  totalReferralBonuses: string;
  totalTrainingPayouts: string;
  totalWithdrawnTokens: string;
  totalWithdrawnUsdt: string;
  subscriptionPoolsCount: number;
  activeSubscriptionPools: number;
  activeSubscriptionPoolUsd: string;
  blogPostsCount: number;
  publishedBlogPostsCount: number;
  draftBlogPostsCount: number;
}

export interface PlatformSettings {
  tokenUsdRate: string | null;
  minWithdrawalTokens: string | null;
  resendFromAddress: string | null;
  leadsNotificationAddress: string | null;
  trainingPayoutBonusCapMultiple: string | null;
  taskTokenCost: string | null;
  reverseWordTrainingEnabled: boolean;
  adminPayoutOtpEnabled: boolean;
  wordStuckTimeoutMinutes: number;
  scoringSlaMinutes: number;
  noFailOnTrainEnabled: boolean;
  minScoreRange: string;
  maxScoreRange: string;
  llmGenerationEnabled: boolean;
  llmProviderOrder: string;
  llmWordsPerItem: number;
  llmItemsPerRun: number;
  qualityGateEnabled: boolean;
  qualityWeightConsensus: string;
  qualityWeightNoise: string;
  qualityWeightQuality: string;
  qualityWeightLiveness: string;
  updatedAt: string;
  createdAt: string;
}

export interface PlatformSettingsInput {
  tokenUsdRate?: number | null;
  minWithdrawalTokens?: number | null;
  resendFromAddress?: string | null;
  leadsNotificationAddress?: string | null;
  trainingPayoutBonusCapMultiple?: number | null;
  taskTokenCost?: number | null;
  reverseWordTrainingEnabled?: boolean;
  adminPayoutOtpEnabled?: boolean;
  wordStuckTimeoutMinutes?: number;
  scoringSlaMinutes?: number;
  noFailOnTrainEnabled?: boolean;
  minScoreRange?: number;
  maxScoreRange?: number;
  llmGenerationEnabled?: boolean;
  llmProviderOrder?: string;
  llmWordsPerItem?: number;
  llmItemsPerRun?: number;
  qualityGateEnabled?: boolean;
  qualityWeightConsensus?: number;
  qualityWeightNoise?: number;
  qualityWeightQuality?: number;
  qualityWeightLiveness?: number;
}

export type WordTrainingDirection = 'ENGLISH_TO_DIALECT' | 'DIALECT_TO_ENGLISH';
export type RecordingNoiseRating = 'NOISY' | 'FAIR' | 'QUIET';

export interface WordTrainingSession {
  sessionId: string;
  dialectTag: string;
  dialectName: string;
  reverseTrainingEnabled: boolean;
  termsVersion: string;
}

export interface WordTrainingAssignment {
  assignmentId: string;
  direction: WordTrainingDirection;
  promptText: string;
  sourceLanguage: string;
  responseLanguage: string;
}

export interface WordRecordingUpload {
  uploadUrl: string;
  key: string;
  bucket: string;
  expiresInSeconds: number;
}

export interface SubscriptionPool {
  id: string;
  subscriberName: string;
  subscriberEmail: string;
  organization: string | null;
  usdAmount: string;
  status: 'ACTIVE' | 'CLOSED';
  note: string | null;
  dataAccessLeadId: string | null;
  openedByUserId: string;
  createdAt: string;
  closedAt: string | null;
}

export interface SubscriptionPoolsPage {
  items: SubscriptionPool[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface SubscriptionPoolInput {
  subscriberName: string;
  subscriberEmail: string;
  organization?: string;
  usdAmount: number;
  note?: string;
  dataAccessLeadId?: string;
}

export interface PoolsSummary {
  totalAvailableTokens: string;
  totalAvailableUsd: string;
  activePoolCount: number;
  totalSettledTokens: string;
}

export interface TrainerSubmissionSummary {
  id: string;
  promptText: string;
  dialectTag: string;
  status: 'PENDING' | 'TRANSCRIBED' | 'REJECTED' | 'SCORED' | 'SETTLED';
  tokensSpent: string;
  score: string | null;
  noiseScore: string | null;
  qualityScore: string | null;
  livenessScore: string | null;
  compositeScore: string | null;
  payoutTokenAmount: string | null;
  audioUrl: string | null;
  rejectionReason: string | null;
  createdAt: string;
  scoredAt: string | null;
  settledAt: string | null;
}

export interface SubmissionsPage {
  items: TrainerSubmissionSummary[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface AdminWordTranslation {
  id: string;
  dialectTag: string;
  text: string;
  createdAt: string;
}

export interface AdminWord {
  id: string;
  text: string;
  createdAt: string;
  translations: AdminWordTranslation[];
}

export interface AdminWordsPage {
  items: AdminWord[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface AdminPromptTranslation {
  id: string;
  dialectTag: string;
  text: string;
  createdAt: string;
}

export interface AdminPrompt {
  id: string;
  dialectTag: string;
  text: string;
  active: boolean;
  createdAt: string;
  translations: AdminPromptTranslation[];
}

export interface AdminPromptsPage {
  items: AdminPrompt[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export type BlogPostStatus = 'DRAFT' | 'PUBLISHED';

export interface EditorBlock {
  id?: string;
  type: string;
  data: Record<string, unknown>;
}

export interface EditorDocument {
  time?: number;
  version?: string;
  blocks: EditorBlock[];
}

export interface BlogPost {
  id: string;
  slug: string;
  title: string;
  content: EditorDocument;
  excerpt: string;
  coverImageUrl: string | null;
  coverImageKey: string | null;
  coverImageAlt: string | null;
  status: BlogPostStatus;
  sortOrder: number;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  author: { email: string };
}

export interface BlogPostInput {
  title: string;
  content: EditorDocument;
  coverImageUrl?: string;
  coverImageKey?: string;
  coverImageAlt?: string;
  status?: BlogPostStatus;
}

export interface BlogMediaUpload {
  url: string;
  key: string;
  bucket: string;
  publicUrl: string;
  expiresInSeconds: number;
}

export interface ApiErrorShape {
  statusCode?: number;
  message?: string | string[];
  error?: string;
  path?: string;
  timestamp?: string;
}

function normalizeErrorMessage(error: unknown, fallback: string) {
  if (typeof error === 'object' && error && 'data' in error) {
    const data = (error as { data?: ApiErrorShape }).data;
    if (Array.isArray(data?.message)) {
      return data.message.join(' ');
    }
    if (data?.message) {
      return data.message;
    }
  }
  return fallback;
}

export const dialectivaApi = createApi({
  reducerPath: 'dialectivaApi',
  baseQuery: fetchBaseQuery({
    baseUrl: PUBLIC_API_V1_BASE_URL,
    prepareHeaders: async (headers) => {
      headers.set('Content-Type', 'application/json');
      // A session-lookup failure must never block a request -- most endpoints
      // (geo/countries, geo/stats, blog/posts, ...) are public and don't need
      // a token at all.
      const session = await getCurrentSession().catch(() => null);
      if (session?.accessToken) {
        headers.set('Authorization', `Bearer ${session.accessToken}`);
      }
      return headers;
    },
  }),
  tagTypes: ['Auth', 'Wallet', 'ReferralSettings', 'Users', 'AdminCountries', 'AdminDialects', 'PlatformSettings', 'BlogPosts', 'Pools', 'Submissions', 'AdminWords', 'AdminPrompts', 'DataAccessLeads'],
  endpoints: (builder) => ({
    register: builder.mutation<PendingOtp, { firstName: string; lastName: string; email: string; password: string; referralCode?: string }>({
      query: (body) => ({
        url: '/auth/register',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Auth'],
    }),
    getCountries: builder.query<Country[], void>({
      query: () => '/geo/countries',
    }),
    getDialects: builder.query<Dialect[], string>({
      query: (countryId) => `/geo/countries/${countryId}/dialects`,
    }),
    getWallet: builder.query<Wallet, void>({
      query: () => '/wallet',
      providesTags: ['Wallet'],
    }),
    getTrainerDashboard: builder.query<TrainerDashboardSummary, void>({
      query: () => '/wallet/dashboard',
      providesTags: ['Wallet'],
    }),
    getEarningHistory: builder.query<EarningHistoryPage, { page: number; pageSize: number }>({
      query: ({ page, pageSize }) => ({ url: '/wallet/earnings', params: { page, pageSize } }),
      providesTags: ['Wallet'],
    }),
    getEarningsChart: builder.query<EarningsChart, { range: EarningsChartRange }>({
      query: ({ range }) => ({ url: '/wallet/earnings-chart', params: { range } }),
      providesTags: ['Wallet'],
    }),
    getMySubmissions: builder.query<SubmissionsPage, { page: number; pageSize: number; status?: TrainerSubmissionSummary['status'][] }>({
      query: ({ page, pageSize, status }) => ({
        url: '/submissions/mine',
        params: { page, pageSize, status: status?.join(',') },
      }),
      providesTags: ['Submissions'],
    }),
    getMyWordRecordings: builder.query<SubmissionsPage, { page: number; pageSize: number; status?: TrainerSubmissionSummary['status'][] }>({
      query: ({ page, pageSize, status }) => ({
        url: '/words/mine',
        params: { page, pageSize, status: status?.join(',') },
      }),
      providesTags: ['Submissions'],
    }),
    startWordTrainingSession: builder.mutation<WordTrainingSession, { acceptedVoiceTerms: true }>({
      query: (body) => ({ url: '/words/sessions', method: 'POST', body }),
    }),
    getNextWordTrainingAssignment: builder.query<WordTrainingAssignment, string>({
      query: (sessionId) => `/words/sessions/${sessionId}/next`,
    }),
    endWordTrainingSession: builder.mutation<{ ended: boolean }, string>({
      query: (sessionId) => ({ url: `/words/sessions/${sessionId}/end`, method: 'POST' }),
    }),
    createWordRecordingUpload: builder.mutation<WordRecordingUpload, { assignmentId: string; contentType: string }>({
      query: (body) => ({ url: '/words/recordings/upload-url', method: 'POST', body }),
    }),
    submitWordRecording: builder.mutation<
      { recordingId: string; status: string; direction: WordTrainingDirection; validationScore: number | null },
      {
        assignmentId: string;
        responseText: string;
        bucket: string;
        audioKey: string;
        durationMs: number;
        noiseRating: RecordingNoiseRating;
      }
    >({
      query: (body) => ({ url: '/words/recordings', method: 'POST', body }),
      invalidatesTags: ['Submissions', 'Wallet'],
    }),
    requestDepositOtp: builder.mutation<{ otpRequestId: string; expiresInSeconds: number }, { usdAmount: number; currency: 'USDC' | 'USDT' }>({
      query: (body) => ({ url: '/wallet/deposits/otp', method: 'POST', body }),
    }),
    createTokenDeposit: builder.mutation<
      { depositId: string; hostedCheckoutUrl: string },
      { usdAmount: number; currency: 'USDC' | 'USDT'; otpRequestId: string; code: string }
    >({
      query: (body) => ({ url: '/wallet/deposits', method: 'POST', body }),
    }),
    requestWithdrawalOtp: builder.mutation<{ otpRequestId: string; expiresInSeconds: number }, { tokenAmount: number; destinationAddress: string }>({
      query: (body) => ({ url: '/wallet/withdrawals/otp', method: 'POST', body }),
    }),
    createWithdrawal: builder.mutation<
      { withdrawalId: string; status: string },
      { tokenAmount: number; destinationAddress: string; otpRequestId: string; code: string }
    >({
      query: (body) => ({ url: '/wallet/withdrawals', method: 'POST', body }),
      invalidatesTags: ['Wallet'],
    }),
    getMe: builder.query<PublicUser, void>({
      query: () => '/auth/me',
    }),
    updateProfile: builder.mutation<
      PublicUser,
      { countryId?: string; dialectId?: string; firstName?: string; lastName?: string }
    >({
      query: (body) => ({
        url: '/auth/me',
        method: 'PATCH',
        body,
      }),
    }),
    requestMagicLink: builder.mutation<void, { email: string }>({
      query: (body) => ({
        url: '/auth/magic-link/request',
        method: 'POST',
        body,
      }),
    }),
    requestPasswordReset: builder.mutation<void, { email: string }>({
      query: (body) => ({
        url: '/auth/password-reset/request',
        method: 'POST',
        body,
      }),
    }),
    resetPassword: builder.mutation<void, { token: string; newPassword: string }>({
      query: (body) => ({
        url: '/auth/password-reset/confirm',
        method: 'POST',
        body,
      }),
    }),
    verifyEmail: builder.mutation<void, { token: string }>({
      query: (body) => ({
        url: '/auth/verify-email',
        method: 'POST',
        body,
      }),
    }),
    createDataAccessLead: builder.mutation<{ id: string; status: string }, DataAccessLeadInput>({
      query: (body) => ({
        url: '/leads/data-access',
        method: 'POST',
        body,
      }),
    }),
    getAdminDataAccessLeads: builder.query<DataAccessLeadsPage, { page?: number; pageSize?: number } | void>({
      query: (params) => ({
        url: '/leads/admin/data-access',
        params: params ?? undefined,
      }),
      providesTags: ['DataAccessLeads'],
    }),
    updateAdminDataAccessLeadContact: builder.mutation<
      AdminDataAccessLead,
      { id: string; body: DataAccessLeadContactUpdateInput }
    >({
      query: ({ id, body }) => ({
        url: `/leads/admin/data-access/${id}/contact`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['DataAccessLeads'],
    }),
    getReferralSettings: builder.query<ReferralSettings, void>({
      query: () => '/admin/referral-settings',
      providesTags: ['ReferralSettings'],
    }),
    updateReferralSettings: builder.mutation<ReferralSettings, ReferralSettingsInput>({
      query: (body) => ({
        url: '/admin/referral-settings',
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['ReferralSettings'],
    }),
    getReferrals: builder.query<ReferralSummary[], void>({
      query: () => '/admin/referrals',
    }),
    getPoolsSummary: builder.query<PoolsSummary, void>({
      query: () => '/admin/pools/summary',
      providesTags: ['Pools'],
    }),
    listSubscriptionPools: builder.query<SubscriptionPoolsPage, { page?: number; pageSize?: number; status?: 'ACTIVE' | 'CLOSED' } | void>({
      query: (params) => ({ url: '/admin/pools', params: params ?? undefined }),
      providesTags: ['Pools'],
    }),
    createSubscriptionPool: builder.mutation<SubscriptionPool, SubscriptionPoolInput>({
      query: (body) => ({ url: '/admin/pools', method: 'POST', body }),
      invalidatesTags: ['Pools'],
    }),
    closeSubscriptionPool: builder.mutation<SubscriptionPool, string>({
      query: (id) => ({ url: `/admin/pools/${id}/close`, method: 'PATCH' }),
      invalidatesTags: ['Pools'],
    }),
    updateSubscriptionPool: builder.mutation<SubscriptionPool, { id: string; body: Partial<SubscriptionPoolInput> }>({
      query: ({ id, body }) => ({ url: `/admin/pools/${id}`, method: 'PATCH', body }),
      invalidatesTags: ['Pools'],
    }),
    deleteSubscriptionPool: builder.mutation<{ id: string }, string>({
      query: (id) => ({ url: `/admin/pools/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Pools'],
    }),
    getAdminStats: builder.query<AdminStats, void>({
      query: () => '/admin/stats',
    }),
    getUsers: builder.query<PublicUser[], { role?: string; status?: string; search?: string } | void>({
      query: (params) => ({
        url: '/auth/admin/users',
        params: params ?? undefined,
      }),
      providesTags: ['Users'],
    }),
    updateUserRole: builder.mutation<PublicUser, { id: string; role: string }>({
      query: ({ id, role }) => ({
        url: `/auth/admin/users/${id}/role`,
        method: 'PATCH',
        body: { role },
      }),
      invalidatesTags: ['Users'],
    }),
    updateUserStatus: builder.mutation<PublicUser, { id: string; status: string }>({
      query: ({ id, status }) => ({
        url: `/auth/admin/users/${id}/status`,
        method: 'PATCH',
        body: { status },
      }),
      invalidatesTags: ['Users'],
    }),
    requestTrainingPayoutOtp: builder.mutation<
      { otpRequestId: string; expiresInSeconds: number },
      { userId: string; tokenAmount: number; reference: string }
    >({
      query: (body) => ({ url: '/admin/training-payouts/otp', method: 'POST', body }),
    }),
    createTrainingPayout: builder.mutation<
      { userId: string; netAmount: string },
      { userId: string; tokenAmount: number; reference: string; otpRequestId?: string; code?: string }
    >({
      query: (body) => ({
        url: '/admin/training-payouts',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Wallet'],
    }),
    getAdminCountries: builder.query<AdminCountry[], void>({
      query: () => '/geo/admin/countries',
      providesTags: ['AdminCountries'],
    }),
    createCountry: builder.mutation<AdminCountry, CountryInput>({
      query: (body) => ({ url: '/geo/admin/countries', method: 'POST', body }),
      invalidatesTags: ['AdminCountries'],
    }),
    updateCountry: builder.mutation<AdminCountry, { id: string; body: Partial<CountryInput> }>({
      query: ({ id, body }) => ({ url: `/geo/admin/countries/${id}`, method: 'PATCH', body }),
      invalidatesTags: ['AdminCountries', 'AdminDialects'],
    }),
    deleteCountry: builder.mutation<{ id: string; deleted: boolean }, string>({
      query: (id) => ({ url: `/geo/admin/countries/${id}`, method: 'DELETE' }),
      invalidatesTags: ['AdminCountries'],
    }),
    getAdminDialects: builder.query<AdminDialect[], void>({
      query: () => '/geo/admin/dialects',
      providesTags: ['AdminDialects'],
    }),
    createDialect: builder.mutation<AdminDialect, DialectInput>({
      query: (body) => ({ url: '/geo/admin/dialects', method: 'POST', body }),
      invalidatesTags: ['AdminDialects', 'AdminCountries'],
    }),
    updateDialect: builder.mutation<AdminDialect, { id: string; body: Partial<DialectInput> }>({
      query: ({ id, body }) => ({ url: `/geo/admin/dialects/${id}`, method: 'PATCH', body }),
      invalidatesTags: ['AdminDialects', 'AdminCountries'],
    }),
    deleteDialect: builder.mutation<{ id: string; deleted: boolean }, string>({
      query: (id) => ({ url: `/geo/admin/dialects/${id}`, method: 'DELETE' }),
      invalidatesTags: ['AdminDialects', 'AdminCountries'],
    }),
    getPlatformSettings: builder.query<PlatformSettings, void>({
      query: () => '/admin/platform-settings',
      providesTags: ['PlatformSettings'],
    }),
    updatePlatformSettings: builder.mutation<PlatformSettings, PlatformSettingsInput>({
      query: (body) => ({
        url: '/admin/platform-settings',
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['PlatformSettings'],
    }),
    getAdminWords: builder.query<AdminWordsPage, { page: number; pageSize: number; search?: string }>({
      query: ({ page, pageSize, search }) => ({ url: '/words/admin', params: { page, pageSize, search } }),
      providesTags: ['AdminWords'],
    }),
    deleteWord: builder.mutation<{ id: string; deleted: boolean }, string>({
      query: (id) => ({ url: `/words/admin/${id}`, method: 'DELETE' }),
      invalidatesTags: ['AdminWords'],
    }),
    getAdminPrompts: builder.query<AdminPromptsPage, { page: number; pageSize: number; dialectTag?: string; search?: string }>({
      query: ({ page, pageSize, dialectTag, search }) => ({ url: '/prompts/admin', params: { page, pageSize, dialectTag, search } }),
      providesTags: ['AdminPrompts'],
    }),
    updatePrompt: builder.mutation<AdminPrompt, { id: string; active: boolean }>({
      query: ({ id, active }) => ({ url: `/prompts/admin/${id}`, method: 'PATCH', body: { active } }),
      invalidatesTags: ['AdminPrompts'],
    }),
    getAdminBlogPosts: builder.query<BlogPost[], void>({
      query: () => '/blog/admin/posts',
      providesTags: ['BlogPosts'],
    }),
    getAdminBlogPost: builder.query<BlogPost, string>({
      query: (id) => `/blog/admin/posts/${id}`,
      providesTags: (_result, _error, id) => [{ type: 'BlogPosts', id }],
    }),
    createBlogPost: builder.mutation<BlogPost, BlogPostInput>({
      query: (body) => ({ url: '/blog/admin/posts', method: 'POST', body }),
      invalidatesTags: ['BlogPosts'],
    }),
    updateBlogPost: builder.mutation<BlogPost, { id: string; body: Partial<BlogPostInput> }>({
      query: ({ id, body }) => ({ url: `/blog/admin/posts/${id}`, method: 'PATCH', body }),
      invalidatesTags: (_result, _error, { id }) => ['BlogPosts', { type: 'BlogPosts', id }],
    }),
    deleteBlogPost: builder.mutation<{ id: string; deleted: boolean }, string>({
      query: (id) => ({ url: `/blog/admin/posts/${id}`, method: 'DELETE' }),
      invalidatesTags: ['BlogPosts'],
    }),
    reorderBlogPosts: builder.mutation<{ reordered: number }, { items: { id: string; sortOrder: number }[] }>({
      query: (body) => ({ url: '/blog/admin/posts/reorder', method: 'PATCH', body }),
      invalidatesTags: ['BlogPosts'],
    }),
    createBlogMediaUpload: builder.mutation<BlogMediaUpload, { fileName: string; contentType: string; kind: 'IMAGE' | 'VIDEO' }>({
      query: (body) => ({ url: '/blog/admin/media/upload-url', method: 'POST', body }),
    }),
  }),
});

export const {
  useRegisterMutation,
  useRequestMagicLinkMutation,
  useRequestPasswordResetMutation,
  useResetPasswordMutation,
  useVerifyEmailMutation,
  useGetCountriesQuery,
  useGetDialectsQuery,
  useGetWalletQuery,
  useGetTrainerDashboardQuery,
  useGetEarningHistoryQuery,
  useGetEarningsChartQuery,
  useGetMySubmissionsQuery,
  useGetMyWordRecordingsQuery,
  useStartWordTrainingSessionMutation,
  useLazyGetNextWordTrainingAssignmentQuery,
  useEndWordTrainingSessionMutation,
  useCreateWordRecordingUploadMutation,
  useSubmitWordRecordingMutation,
  useRequestDepositOtpMutation,
  useCreateTokenDepositMutation,
  useRequestWithdrawalOtpMutation,
  useCreateWithdrawalMutation,
  useGetMeQuery,
  useUpdateProfileMutation,
  useCreateDataAccessLeadMutation,
  useGetAdminDataAccessLeadsQuery,
  useUpdateAdminDataAccessLeadContactMutation,
  useGetReferralSettingsQuery,
  useUpdateReferralSettingsMutation,
  useGetReferralsQuery,
  useGetPoolsSummaryQuery,
  useListSubscriptionPoolsQuery,
  useCreateSubscriptionPoolMutation,
  useCloseSubscriptionPoolMutation,
  useUpdateSubscriptionPoolMutation,
  useDeleteSubscriptionPoolMutation,
  useGetAdminStatsQuery,
  useGetUsersQuery,
  useUpdateUserRoleMutation,
  useUpdateUserStatusMutation,
  useRequestTrainingPayoutOtpMutation,
  useCreateTrainingPayoutMutation,
  useGetAdminCountriesQuery,
  useCreateCountryMutation,
  useUpdateCountryMutation,
  useDeleteCountryMutation,
  useGetAdminDialectsQuery,
  useCreateDialectMutation,
  useUpdateDialectMutation,
  useDeleteDialectMutation,
  useGetPlatformSettingsQuery,
  useUpdatePlatformSettingsMutation,
  useGetAdminWordsQuery,
  useDeleteWordMutation,
  useGetAdminPromptsQuery,
  useUpdatePromptMutation,
  useGetAdminBlogPostsQuery,
  useGetAdminBlogPostQuery,
  useCreateBlogPostMutation,
  useUpdateBlogPostMutation,
  useDeleteBlogPostMutation,
  useReorderBlogPostsMutation,
  useCreateBlogMediaUploadMutation,
} = dialectivaApi;

export { normalizeErrorMessage };

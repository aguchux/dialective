import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import type { BaseQueryFn } from '@reduxjs/toolkit/query/react';
import { PUBLIC_API_V1_BASE_URL } from '@/lib/public-api';
import { getCurrentSession } from '@/lib/client-session';
import { notifyAuthMaintenance } from '@/lib/auth-maintenance-signal';

export interface PublicUser {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  role: 'TRAINER' | 'ADMIN' | 'PARTNER' | 'DISTRIBUTOR';
  status: 'ACTIVE' | 'SUSPENDED' | 'BLOCKED';
  emailVerified: boolean;
  phoneNumber: string | null;
  phoneVerified: boolean;
  countryId: string | null;
  dialectId: string | null;
  dialectTag: string | null;
  dialectVariantId: string | null;
  dialectVariantTag: string | null;
  onboardingComplete: boolean;
  referralCode: string;
  emailNotificationsEnabled: boolean;
  smsNotificationsEnabled: boolean;
  marketingNotificationsEnabled: boolean;
  blogNewsNotificationsEnabled: boolean;
  walletBalance?: string;
  submissionsCount?: number;
  wordRecordingsCount?: number;
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
  currencyCode: string;
}

export interface Dialect {
  id: string;
  tag: string;
  name: string;
}

export interface DialectVariant {
  id: string;
  tag: string;
  name: string;
}

export interface AdminDialectVariant extends DialectVariant {
  _count: { users: number; wordRecordings: number; submissions: number };
}

export interface DialectVariantInput {
  tag: string;
  name: string;
}

export interface AdminCountry {
  id: string;
  code: string;
  name: string;
  llmGenerationEnabled: boolean;
  currencyCode: string;
  usdExchangeRate: string | null;
  exchangeRateSource: 'LIVE' | 'MANUAL';
  exchangeRateUpdatedAt: string | null;
  _count: { dialects: number; users: number };
}

export interface AdminDialect {
  id: string;
  tag: string;
  name: string;
  countryId: string;
  llmGenerationEnabled: boolean;
  keyboardLayout: string | null;
  country: { id: string; name: string; code: string };
  _count: { users: number };
}

export interface CountryInput {
  code: string;
  name: string;
  llmGenerationEnabled?: boolean;
  currencyCode?: string;
  usdExchangeRate?: number;
}

export interface DialectInput {
  tag: string;
  name: string;
  countryId: string;
  llmGenerationEnabled?: boolean;
  keyboardLayout?: string;
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

export interface ReferralInviteInput {
  firstName: string;
  email: string;
}

export interface ReferralSummary {
  referrerEmail: string | null;
  referralCode: string | null;
  referredUsers: { id: string; email: string; createdAt: string }[];
  totalCommission: string;
  bonusEventCount: number;
}

export interface DistributorSettings {
  id: string;
  enabled: boolean;
  bulkAllocationEnabled: boolean;
  defaultBulkDiscountRate: string;
  multiLevelReferralEnabled: boolean;
  maxReferralDepth: number;
  level1Rate: string;
  level2Rate: string;
  level3Rate: string;
  level4Rate: string;
  level5Rate: string;
  updatedAt: string;
  createdAt: string;
}

export interface DistributorSettingsInput {
  enabled?: boolean;
  bulkAllocationEnabled?: boolean;
  defaultBulkDiscountRate?: number;
  multiLevelReferralEnabled?: boolean;
  maxReferralDepth?: number;
  level1Rate?: number;
  level2Rate?: number;
  level3Rate?: number;
  level4Rate?: number;
  level5Rate?: number;
}

export interface DistributorAllocation {
  id: string;
  distributorId: string;
  grantedById: string;
  tokenAmount: string;
  discountRate: string;
  note: string | null;
  createdAt: string;
}

/** Admin allocation-history row -- same fields as DistributorAllocation plus the two parties' display name/email, so the admin list doesn't need a separate user lookup per row. */
export interface DistributorAllocationWithParties extends DistributorAllocation {
  distributor: { id: string; name: string; email: string };
  grantedBy: { id: string; name: string; email: string };
}

export interface DistributorAllocationsPage {
  items: DistributorAllocationWithParties[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** Row on the admin Distributors list -- one per DISTRIBUTOR-role user, with lifetime credit/debit totals from their full ledger, not just bulk allocations. */
export interface DistributorAdminSummary {
  id: string;
  name: string;
  email: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'BLOCKED';
  tokenBalance: string;
  lockedBalance: string;
  totalCredit: string;
  totalDebit: string;
  createdAt: string;
}

export interface DistributorActivityEntry {
  id: string;
  type: LedgerEntryType;
  amount: string;
  reference: string;
  createdAt: string;
}

export interface DistributorActivityPage {
  items: DistributorActivityEntry[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** Same shape as DistributorActivityEntry/Page, for any user's wallet ledger (not just role=DISTRIBUTOR). */
export type UserActivityEntry = DistributorActivityEntry;
export type UserActivityPage = DistributorActivityPage;

// No `role` field -- the network view is deliberately name + balance only,
// see DistributorsService.loadNetworkLevels' NetworkNode type on the backend.
export interface DistributorNetworkNode {
  id: string;
  name: string;
  level: number;
  tokenBalance: string;
  children: DistributorNetworkNode[];
}

export interface DistributorNetwork {
  maxDepth: number;
  directMembers: number;
  totalMembers: number;
  totalTokenBalance: string;
  tree: DistributorNetworkNode[];
  allMembers: Omit<DistributorNetworkNode, 'children'>[];
}

export interface DistributorReferralBonusLevel {
  level: number;
  amount: string;
}

export interface DistributorDashboard {
  settings: DistributorSettings;
  profile: { id: string; name: string; email: string; referralCode: string };
  wallet: { balance: string; lockedBalance: string };
  metrics: {
    networkMembers: number;
    networkTokenBalance: string;
    directReferrals: number;
    referralBonuses: string;
    activeSellOffers: number;
    activeBuyRequests: number;
    completedSales: number;
  };
  referralBonusesByLevel: DistributorReferralBonusLevel[];
  allocations: DistributorAllocation[];
  network: DistributorNetwork;
}

/** Row on a distributor's own "Sub-distributors" list -- same shape as DistributorAdminSummary, scoped to the caller's own promotedById tree. */
export type SubDistributorSummary = DistributorAdminSummary;

export interface PromotedSubDistributor {
  id: string;
  name: string;
  email: string;
  role: 'DISTRIBUTOR';
}

export interface SubDistributorAdjustment {
  id: string;
  amount: string;
  reference: string;
  createdAt: string;
}

export interface LocalCurrency {
  code: string;
  usdExchangeRate: string;
  updatedAt: string | null;
}

export interface Wallet {
  balance: string;
  lockedBalance: string;
  tokenUsdRate: number;
  taskTokenCost: string;
  localCurrency: LocalCurrency | null;
  balanceInLocalCurrency: string | null;
}

export type WithdrawalCurrency = 'USDT' | 'USDC';
export type WithdrawalNetwork = 'TRC20' | 'ERC20' | 'BEP20' | 'SOL' | 'POLYGON';
export type WithdrawalStatus = 'PENDING' | 'APPROVED' | 'PROCESSING' | 'PAID' | 'FAILED' | 'REJECTED';

export interface AdminWithdrawalRequest {
  id: string;
  walletId: string;
  wallet: { user: { email: string } };
  tokenAmount: string;
  usdtAmount: string;
  destinationAddress: string;
  destinationCurrency: WithdrawalCurrency;
  destinationNetwork: WithdrawalNetwork;
  status: WithdrawalStatus;
  approvedByAdminId: string | null;
  approvedAt: string | null;
  provider: string | null;
  providerPayoutId: string | null;
  providerStatus: string | null;
  providerCurrency: string | null;
  providerNetwork: string | null;
  providerAddress: string | null;
  providerError: string | null;
  submittedToProviderAt: string | null;
  providerSettledAt: string | null;
  adminNote: string | null;
  createdAt: string;
  resolvedAt: string | null;
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
  | 'REFERRAL_PAYOUT_BONUS'
  | 'DISTRIBUTOR_BULK_ALLOCATION'
  | 'DISTRIBUTOR_FUNDING_BONUS'
  | 'DISTRIBUTOR_PAYOUT_BONUS'
  | 'SUB_DISTRIBUTOR_ADJUSTMENT'
  | 'ADMIN_FUNDING'
  | 'STARTUP_BONUS'
  | 'P2P_ESCROW_LOCK'
  | 'P2P_ESCROW_REFUND'
  | 'P2P_ESCROW_RELEASE'
  | 'P2P_ESCROW_CREDIT';

export type P2POfferType = 'SELL' | 'BUY';
export type P2POfferStatus = 'ACTIVE' | 'RESERVED' | 'EXPIRED' | 'CANCELLED' | 'COMPLETED' | 'DISPUTED';
export type P2PTradeStatus = 'AWAITING_PAYMENT' | 'PAID_MARKED' | 'RELEASED' | 'CANCEL_PENDING' | 'CANCELLED' | 'DISPUTED' | 'EXPIRED';
export type P2PDisputeStatus = 'OPEN' | 'RESOLVED_BUYER' | 'RESOLVED_SELLER';

export interface UserPaymentMethod {
  id: string;
  label: string;
  methodType: string;
  fiatCurrency: string;
  bankName: string | null;
  accountName: string | null;
  accountNumber: string | null;
  instructions: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentMethodInput {
  id?: string;
  label: string;
  methodType: string;
  fiatCurrency: string;
  bankName?: string;
  accountName?: string;
  accountNumber?: string;
  instructions?: string;
  enabled?: boolean;
}

export interface VerifiedPaymentMethodInput extends PaymentMethodInput {
  otpRequestId: string;
  code: string;
}

export interface P2PMarketSettings {
  enabled: boolean;
  sellOffersEnabled: boolean;
  buyRequestsEnabled: boolean;
  minTradeTokens: string;
  maxTradeTokens: string;
  paymentWindowMinutes: number;
  cancelGraceMinutes: number;
  offerExpiryMinutes: number;
  maxOpenOffersPerUser: number;
  maxOpenTradesPerUser: number;
  allowedFiatCurrencies: string;
  allowedPaymentMethods: string;
  disputeWindowMinutes: number;
  adminOtpRequiredForDisputes: boolean;
  updatedAt: string;
  createdAt: string;
}

export interface P2PReferenceRate {
  currencyCode: string | null;
  tokenReferencePrice: string | null;
  updatedAt: string | null;
}

export interface P2POffer {
  id: string;
  type: P2POfferType;
  userId: string;
  user?: { id: string; email: string; firstName: string | null; lastName: string | null };
  tokenAmount: string;
  remainingTokens: string;
  fiatAmount: string;
  fiatCurrency: string;
  paymentMethod: string;
  paymentMethodDetails: UserPaymentMethod | null;
  status: P2POfferStatus;
  expiresAt: string;
  completedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface P2PTraderProfile {
  id: string;
  firstName: string | null;
  lastName: string | null;
  memberSince: string;
  completedSaleCount: number;
  avgReleaseSeconds: number | null;
}

export interface P2PTrade {
  id: string;
  offerId: string;
  offerType: P2POfferType;
  buyerId: string;
  sellerId: string;
  buyer: { id: string; email: string; firstName: string | null; lastName: string | null };
  seller: { id: string; email: string; firstName: string | null; lastName: string | null };
  tokenAmount: string;
  fiatAmount: string;
  fiatCurrency: string;
  paymentMethod: string;
  sellerPaymentMethod: UserPaymentMethod | null;
  status: P2PTradeStatus;
  paymentDeadlineAt: string;
  cancelRequestedByUserId: string | null;
  cancelAvailableAt: string | null;
  paidAt: string | null;
  releasedAt: string | null;
  cancelledAt: string | null;
  disputedAt: string | null;
  dispute: { id: string; status: P2PDisputeStatus; reason: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface P2PDispute {
  id: string;
  status: P2PDisputeStatus;
  reason: string;
  evidenceUrl: string | null;
  resolutionNote: string | null;
  createdAt: string;
  resolvedAt: string | null;
  raisedBy: { id: string; email: string; firstName: string | null; lastName: string | null };
  trade: P2PTrade;
}

export interface TrainerDashboardSummary {
  balance: string;
  lockedBalance: string;
  tokenUsdRate: number;
  taskTokenCost: string;
  scoringSlaMinutes: number;
  recordingRoundTimeoutSeconds: number;
  recordingRoundMaxTimeoutSeconds: number;
  minWithdrawalTokens: string;
  localCurrency: LocalCurrency | null;
  balanceInLocalCurrency: string | null;
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
    recentInvites: { id: string; firstName: string | null; email: string; createdAt: string; status: 'INVITED' | 'JOINED' }[];
    cookiePersistSeconds: number;
    inviteExpirySeconds: number;
    fundingBonusRate: string;
    fundingBonusEnabled: boolean;
    payoutBonusRate: string;
    payoutBonusEnabled: boolean;
  };
}

export interface PublicClientSettings {
  referralCookiePersistSeconds: number;
  referralInviteExpirySeconds: number;
  wordTrainingRecordingTimeoutSeconds: number;
  wordTrainingRecordingMaxTimeoutSeconds: number;
  // enabled = login OR signup is blocked; the two flags below let each page
  // (login vs register) show the notice only when it actually applies to it.
  authMaintenanceEnabled: boolean;
  authMaintenanceBlocksLogin: boolean;
  authMaintenanceBlocksSignup: boolean;
  authMaintenanceUntil: string | null;
  authMaintenanceMessage: string | null;
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

export interface WalletActivityPage {
  items: {
    id: string;
    type: LedgerEntryType;
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
  referralCookiePersistSeconds: number;
  referralInviteExpirySeconds: number;
  wordTrainingRecordingTimeoutSeconds: number;
  wordTrainingRecordingMaxTimeoutSeconds: number;
  trainingPayoutBonusCapMultiple: string | null;
  taskTokenCost: string | null;
  reverseWordTrainingEnabled: boolean;
  adminPayoutOtpEnabled: boolean;
  phoneVerificationRequired: boolean;
  startupBonusAmount: string | null;
  wordStuckTimeoutMinutes: number;
  scoringSlaMinutes: number;
  noFailOnTrainEnabled: boolean;
  minScoreRange: string;
  maxScoreRange: string;
  llmGenerationEnabled: boolean;
  llmProviderOrder: string;
  llmWordsPerItem: number;
  llmItemsPerRun: number;
  llmMaxTotalGeneratedItems: number;
  llmMaxPoolPerDialect: number;
  llmBackfillItemsPerDialectPerRun: number;
  qualityGateEnabled: boolean;
  qualityWeightConsensus: string;
  qualityWeightNoise: string;
  qualityWeightQuality: string;
  qualityWeightLiveness: string;
  spellingNormalizationEnabled: boolean;
  spellingNormalizationProviderOrder: string;
  sentenceRebuildEnabled: boolean;
  smsProviderOrder: string;
  smslive247NativeOtpEnabled: boolean;
  smsTransactionalProviderOrder: string;
  p2pSmsTradeCreatedEnabled: boolean;
  p2pSmsPaymentMarkedEnabled: boolean;
  p2pSmsTokensReleasedEnabled: boolean;
  p2pSmsCancelledEnabled: boolean;
  cryptoWithdrawalsEnabled: boolean;
  nowPaymentsPayoutsEnabled: boolean;
  allowedWithdrawalCurrencies: string;
  allowedWithdrawalNetworks: string;
  withdrawalFeeMode: string;
  withdrawalFeeTokenAmount: string;
  withdrawalFeePercent: string;
  autoSubmitAfterApproval: boolean;
  authMaintenanceEnabled: boolean;
  authMaintenanceUntil: string | null;
  authMaintenanceMessage: string | null;
  authMaintenanceBlockLogin: boolean;
  authMaintenanceBlockSignup: boolean;
  authMaintenanceBlockSessions: boolean;
  authMaintenanceExcludeAdmin: boolean;
  authMaintenanceExcludePartner: boolean;
  registerRateLimitPerHour: number;
  updatedAt: string;
  createdAt: string;
}

export interface PlatformSettingsInput {
  tokenUsdRate?: number | null;
  minWithdrawalTokens?: number | null;
  resendFromAddress?: string | null;
  leadsNotificationAddress?: string | null;
  referralCookiePersistSeconds?: number;
  referralInviteExpirySeconds?: number;
  wordTrainingRecordingTimeoutSeconds?: number;
  wordTrainingRecordingMaxTimeoutSeconds?: number;
  trainingPayoutBonusCapMultiple?: number | null;
  taskTokenCost?: number | null;
  reverseWordTrainingEnabled?: boolean;
  adminPayoutOtpEnabled?: boolean;
  phoneVerificationRequired?: boolean;
  startupBonusAmount?: number | null;
  wordStuckTimeoutMinutes?: number;
  scoringSlaMinutes?: number;
  noFailOnTrainEnabled?: boolean;
  minScoreRange?: number;
  maxScoreRange?: number;
  llmGenerationEnabled?: boolean;
  llmProviderOrder?: string;
  llmWordsPerItem?: number;
  llmItemsPerRun?: number;
  llmMaxTotalGeneratedItems?: number;
  llmMaxPoolPerDialect?: number;
  llmBackfillItemsPerDialectPerRun?: number;
  qualityGateEnabled?: boolean;
  qualityWeightConsensus?: number;
  qualityWeightNoise?: number;
  qualityWeightQuality?: number;
  qualityWeightLiveness?: number;
  spellingNormalizationEnabled?: boolean;
  spellingNormalizationProviderOrder?: string;
  sentenceRebuildEnabled?: boolean;
  smsProviderOrder?: string;
  smslive247NativeOtpEnabled?: boolean;
  smsTransactionalProviderOrder?: string;
  p2pSmsTradeCreatedEnabled?: boolean;
  p2pSmsPaymentMarkedEnabled?: boolean;
  p2pSmsTokensReleasedEnabled?: boolean;
  p2pSmsCancelledEnabled?: boolean;
  cryptoWithdrawalsEnabled?: boolean;
  nowPaymentsPayoutsEnabled?: boolean;
  allowedWithdrawalCurrencies?: string;
  allowedWithdrawalNetworks?: string;
  withdrawalFeeMode?: string;
  withdrawalFeeTokenAmount?: number;
  withdrawalFeePercent?: number;
  autoSubmitAfterApproval?: boolean;
  authMaintenanceEnabled?: boolean;
  authMaintenanceUntil?: string | null;
  authMaintenanceMessage?: string | null;
  authMaintenanceBlockLogin?: boolean;
  authMaintenanceBlockSignup?: boolean;
  authMaintenanceBlockSessions?: boolean;
  authMaintenanceExcludeAdmin?: boolean;
  authMaintenanceExcludePartner?: boolean;
  registerRateLimitPerHour?: number;
}

export type WordTrainingDirection = 'ENGLISH_TO_DIALECT' | 'DIALECT_TO_ENGLISH' | 'SENTENCE_REBUILD';
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
  wordId: string | null;
  direction: WordTrainingDirection;
  promptText: string | null;
  sourceAudioUrl?: string | null;
  sourceLanguage: string;
  responseLanguage: string;
  dialectTag: string | null;
  dialectKeyboardLayout: string | null;
  fragments: { text: string; position: number }[] | null;
}

export interface SpellingSuggestion {
  text: string;
  source: 'community' | 'ai';
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
  status: 'PENDING' | 'TRANSCRIBED' | 'REJECTED' | 'SCORED' | 'SETTLED' | 'EXPIRED';
  tokensSpent: string;
  rawScore: string | null;
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

export type PartOfSpeech =
  | 'NOUN'
  | 'VERB'
  | 'ADJECTIVE'
  | 'ADVERB'
  | 'PRONOUN'
  | 'PREPOSITION'
  | 'CONJUNCTION'
  | 'INTERJECTION'
  | 'DETERMINER'
  | 'OTHER';

export const PART_OF_SPEECH_VALUES: PartOfSpeech[] = [
  'NOUN',
  'VERB',
  'ADJECTIVE',
  'ADVERB',
  'PRONOUN',
  'PREPOSITION',
  'CONJUNCTION',
  'INTERJECTION',
  'DETERMINER',
  'OTHER',
];

export interface AdminWordTranslation {
  id: string;
  dialectTag: string;
  text: string;
  partOfSpeech: PartOfSpeech | null;
  createdAt: string;
}

export interface AdminWord {
  id: string;
  text: string;
  partOfSpeech: PartOfSpeech | null;
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

export interface CourseSlide {
  imageUrl?: string;
  imageAlt?: string;
  // Editor.js document, same block-JSON shape as BlogPost.content -- reuses
  // BlogEditor/BlogContent rather than a separate plain-text slide editor.
  text: EditorDocument;
  audioUrl?: string;
}

export interface CourseDocument {
  slides: CourseSlide[];
}

// PUBLIC courses need no login and never track CourseProgress; PRIVATE
// (default) courses study at the protected /dashboard/learn/{slug} viewer.
export type CourseVisibility = 'PUBLIC' | 'PRIVATE';

/** Admin CRUD shape -- full row, no slide content parsed out. */
export interface Course {
  id: string;
  slug: string;
  title: string;
  summary: string;
  coverImageUrl: string | null;
  coverImageKey: string | null;
  coverImageAlt: string | null;
  slides: CourseDocument;
  status: BlogPostStatus;
  visibility: CourseVisibility;
  sortOrder: number;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  author: { email: string };
}

export interface CourseInput {
  title: string;
  summary: string;
  content: CourseDocument;
  coverImageUrl?: string;
  coverImageKey?: string;
  coverImageAlt?: string;
  status?: BlogPostStatus;
  visibility?: CourseVisibility;
}

/** Public catalog card -- no slide content, safe to serve unauthenticated. */
export interface CourseCard {
  id: string;
  slug: string;
  title: string;
  summary: string;
  visibility: CourseVisibility;
  coverImageUrl: string | null;
  coverImageAlt: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Public preview -- catalog card fields plus a slide count, still no slide content. */
export interface CoursePreview extends CourseCard {
  slideCount: number;
}

export interface CourseProgress {
  lastSlideIndex: number;
  completedAt: string | null;
}

/** Protected "study" shape -- full slide content plus the caller's own progress. */
export interface CourseStudy {
  id: string;
  slug: string;
  title: string;
  summary: string;
  coverImageUrl: string | null;
  coverImageAlt: string | null;
  slides: CourseSlide[];
  progress: CourseProgress | null;
}

/** Public, unauthenticated "study" shape (visibility=PUBLIC courses only) -- same as CourseStudy but no progress field, since there's no logged-in user to track it for. */
export interface PublicCourseStudy {
  id: string;
  slug: string;
  title: string;
  summary: string;
  coverImageUrl: string | null;
  coverImageAlt: string | null;
  slides: CourseSlide[];
}

export interface CourseMediaUpload {
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

function normalizeErrorMessage(error: unknown, fallback: string): string {
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

const rawBaseQuery = fetchBaseQuery({
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
});

// Any authenticated request can come back 503/AuthMaintenance the instant an
// admin flips authMaintenanceBlockSessions on -- this is the one place every
// such response passes through, so it's the one place that needs to notice
// and fan the signal out (see lib/auth-maintenance-signal.ts) rather than
// every page/component checking for it individually.
const baseQueryWithMaintenanceSignal: BaseQueryFn = async (args, api, extraOptions) => {
  const result = await rawBaseQuery(args, api, extraOptions);
  if (result.error && result.error.status === 503) {
    const data = result.error.data as { error?: string; authMaintenanceUntil?: string; authMaintenanceMessage?: string | null } | undefined;
    if (data?.error === 'AuthMaintenance') {
      notifyAuthMaintenance({ until: data.authMaintenanceUntil ?? null, message: data.authMaintenanceMessage ?? null });
    }
  }
  return result;
};

export const dialectivaApi = createApi({
  reducerPath: 'dialectivaApi',
  baseQuery: baseQueryWithMaintenanceSignal,
  tagTypes: ['Auth', 'Wallet', 'ReferralSettings', 'DistributorSettings', 'DistributorDashboard', 'DistributorAllocations', 'DistributorList', 'DistributorActivity', 'SubDistributorList', 'SubDistributorActivity', 'Users', 'AdminCountries', 'AdminDialects', 'PlatformSettings', 'BlogPosts', 'Courses', 'Pools', 'Submissions', 'AdminWords', 'AdminPrompts', 'DataAccessLeads', 'P2P', 'Profile'],
  endpoints: (builder) => ({
    register: builder.mutation<PendingOtp, { firstName: string; lastName: string; email: string; password: string; referralCode?: string }>({
      query: (body) => ({
        url: '/auth/register',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Auth'],
    }),
    sendReferralInvite: builder.mutation<void, ReferralInviteInput>({
      query: (body) => ({
        url: '/wallet/referrals/invite',
        method: 'POST',
        body,
      }),
    }),
    getCountries: builder.query<Country[], void>({
      query: () => '/geo/countries',
    }),
    getDialects: builder.query<Dialect[], string>({
      query: (countryId) => `/geo/countries/${countryId}/dialects`,
    }),
    getDialectVariants: builder.query<DialectVariant[], string>({
      query: (dialectId) => `/geo/dialects/${dialectId}/variants`,
    }),
    getWallet: builder.query<Wallet, void>({
      query: () => '/wallet',
      providesTags: ['Wallet'],
    }),
    getP2PSettings: builder.query<P2PMarketSettings, void>({
      query: () => '/p2p/settings',
      providesTags: ['P2P'],
    }),
    getP2PReferenceRate: builder.query<P2PReferenceRate, void>({
      query: () => '/p2p/reference-rate',
      providesTags: ['P2P'],
    }),
    getP2PPaymentMethods: builder.query<UserPaymentMethod[], void>({
      query: () => '/p2p/payment-methods',
      providesTags: ['P2P'],
    }),
    requestP2PPaymentMethodOtp: builder.mutation<{ otpRequestId: string; expiresInSeconds: number }, PaymentMethodInput>({
      query: (body) => ({ url: '/p2p/payment-methods/otp', method: 'POST', body }),
    }),
    createP2PPaymentMethod: builder.mutation<UserPaymentMethod, VerifiedPaymentMethodInput>({
      query: (body) => ({ url: '/p2p/payment-methods', method: 'POST', body }),
      invalidatesTags: ['P2P'],
    }),
    updateP2PPaymentMethod: builder.mutation<UserPaymentMethod, { id: string; body: VerifiedPaymentMethodInput }>({
      query: ({ id, body }) => ({ url: `/p2p/payment-methods/${id}`, method: 'PATCH', body }),
      invalidatesTags: ['P2P'],
    }),
    listP2POffers: builder.query<P2POffer[], { type?: P2POfferType; status?: P2POfferStatus } | void>({
      query: (params) => ({ url: '/p2p/offers', params: params ?? undefined }),
      providesTags: ['P2P'],
    }),
    listMyP2POffers: builder.query<P2POffer[], void>({
      query: () => '/p2p/offers/mine',
      providesTags: ['P2P'],
    }),
    getP2PTraderProfile: builder.query<P2PTraderProfile, string>({
      query: (userId) => `/p2p/traders/${userId}`,
    }),
    requestP2PTradeOtp: builder.mutation<
      { otpRequestId: string; expiresInSeconds: number },
      | { action: 'create-offer'; type: P2POfferType; tokenAmount: number; fiatAmount: number; fiatCurrency: string }
      | { action: 'accept-offer'; offerId: string }
    >({
      query: (body) => ({ url: '/p2p/offers/otp', method: 'POST', body }),
    }),
    createP2POffer: builder.mutation<
      P2POffer,
      {
        type: P2POfferType;
        tokenAmount: number;
        fiatAmount: number;
        fiatCurrency: string;
        paymentMethod: string;
        paymentMethodId?: string;
        expiresInMinutes?: number;
        otpRequestId?: string;
        code?: string;
      }
    >({
      query: (body) => ({ url: '/p2p/offers', method: 'POST', body }),
      invalidatesTags: ['P2P', 'Wallet'],
    }),
    acceptP2POffer: builder.mutation<P2PTrade, { id: string; sellerPaymentMethodId?: string; otpRequestId?: string; code?: string }>({
      query: ({ id, ...body }) => ({ url: `/p2p/offers/${id}/accept`, method: 'POST', body }),
      invalidatesTags: ['P2P', 'Wallet'],
    }),
    cancelP2POffer: builder.mutation<P2POffer, string>({
      query: (id) => ({ url: `/p2p/offers/${id}/cancel`, method: 'POST' }),
      invalidatesTags: ['P2P', 'Wallet'],
    }),
    listMyP2PTrades: builder.query<P2PTrade[], { status?: P2PTradeStatus } | void>({
      query: (params) => ({ url: '/p2p/trades/mine', params: params ?? undefined }),
      providesTags: ['P2P'],
    }),
    markP2PTradePaid: builder.mutation<P2PTrade, string>({
      query: (id) => ({ url: `/p2p/trades/${id}/mark-paid`, method: 'POST' }),
      invalidatesTags: ['P2P'],
    }),
    requestP2PTradeCancel: builder.mutation<P2PTrade, string>({
      query: (id) => ({ url: `/p2p/trades/${id}/request-cancel`, method: 'POST' }),
      invalidatesTags: ['P2P', 'Wallet'],
    }),
    releaseP2PTrade: builder.mutation<P2PTrade, string>({
      query: (id) => ({ url: `/p2p/trades/${id}/release`, method: 'POST' }),
      invalidatesTags: ['P2P', 'Wallet'],
    }),
    raiseP2PDispute: builder.mutation<P2PTrade, { id: string; reason: string; evidenceUrl?: string }>({
      query: ({ id, reason, evidenceUrl }) => ({ url: `/p2p/trades/${id}/dispute`, method: 'POST', body: { reason, evidenceUrl } }),
      invalidatesTags: ['P2P'],
    }),
    getTrainerDashboard: builder.query<TrainerDashboardSummary, void>({
      query: () => '/wallet/dashboard',
      providesTags: ['Wallet'],
    }),
    getEarningHistory: builder.query<EarningHistoryPage, { page: number; pageSize: number }>({
      query: ({ page, pageSize }) => ({ url: '/wallet/earnings', params: { page, pageSize } }),
      providesTags: ['Wallet'],
    }),
    getWalletActivity: builder.query<WalletActivityPage, { page: number; pageSize: number }>({
      query: ({ page, pageSize }) => ({ url: '/wallet/activity', params: { page, pageSize } }),
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
    getSpellingSuggestions: builder.query<
      { suggestions: SpellingSuggestion[] },
      { wordId: string; dialectTag: string; query: string }
    >({
      query: (params) => ({ url: '/words/spelling-suggestions', params }),
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
        responseText?: string;
        bucket?: string;
        audioKey?: string;
        durationMs?: number;
        noiseRating?: RecordingNoiseRating;
        submittedOrder?: number[];
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
    requestWithdrawalOtp: builder.mutation<
      { otpRequestId: string; expiresInSeconds: number },
      { tokenAmount: number; destinationAddress: string; destinationCurrency: WithdrawalCurrency; destinationNetwork: WithdrawalNetwork }
    >({
      query: (body) => ({ url: '/wallet/withdrawals/otp', method: 'POST', body }),
    }),
    createWithdrawal: builder.mutation<
      { withdrawalId: string; status: string },
      {
        tokenAmount: number;
        destinationAddress: string;
        destinationCurrency: WithdrawalCurrency;
        destinationNetwork: WithdrawalNetwork;
        otpRequestId: string;
        code: string;
      }
    >({
      query: (body) => ({ url: '/wallet/withdrawals', method: 'POST', body }),
      invalidatesTags: ['Wallet'],
    }),
    listAdminWithdrawals: builder.query<AdminWithdrawalRequest[], { status?: WithdrawalStatus } | void>({
      query: (params) => ({ url: '/admin/withdrawals', params: params ?? undefined }),
      providesTags: ['Wallet'],
    }),
    requestWithdrawalResolveOtp: builder.mutation<{ otpRequestId: string; expiresInSeconds: number }, string>({
      query: (id) => ({ url: `/admin/withdrawals/${id}/resolve/otp`, method: 'POST' }),
    }),
    approveWithdrawal: builder.mutation<
      { withdrawalId: string; status: string },
      { id: string; otpRequestId?: string; code?: string; adminNote?: string }
    >({
      query: ({ id, ...body }) => ({ url: `/admin/withdrawals/${id}/approve`, method: 'POST', body }),
      invalidatesTags: ['Wallet'],
    }),
    submitWithdrawalToNowPayments: builder.mutation<
      { withdrawalId: string; status: string; providerPayoutId?: string },
      { id: string; otpRequestId?: string; code?: string; verificationCode?: string; adminNote?: string }
    >({
      query: ({ id, ...body }) => ({ url: `/admin/withdrawals/${id}/submit-nowpayments`, method: 'POST', body }),
      invalidatesTags: ['Wallet'],
    }),
    verifyWithdrawalPayout: builder.mutation<
      { withdrawalId: string; status: string; providerPayoutId: string },
      { id: string; verificationCode: string }
    >({
      query: ({ id, verificationCode }) => ({ url: `/admin/withdrawals/${id}/verify-nowpayments`, method: 'POST', body: { verificationCode } }),
      invalidatesTags: ['Wallet'],
    }),
    refreshWithdrawalStatus: builder.mutation<{ withdrawalId: string; status: string; providerPayoutId: string }, string>({
      query: (id) => ({ url: `/admin/withdrawals/${id}/refresh-nowpayments`, method: 'POST' }),
      invalidatesTags: ['Wallet'],
    }),
    resolveWithdrawal: builder.mutation<
      { withdrawalId: string; status: string },
      { id: string; outcome: 'paid' | 'rejected'; otpRequestId?: string; code?: string; adminNote?: string }
    >({
      query: ({ id, ...body }) => ({ url: `/admin/withdrawals/${id}/resolve`, method: 'POST', body }),
      invalidatesTags: ['Wallet'],
    }),
    getMe: builder.query<PublicUser, void>({
      query: () => '/auth/me',
      providesTags: ['Profile'],
    }),
    updateProfile: builder.mutation<
      PublicUser,
      {
        countryId?: string;
        dialectId?: string;
        dialectVariantId?: string;
        firstName?: string;
        lastName?: string;
        emailNotificationsEnabled?: boolean;
        smsNotificationsEnabled?: boolean;
        marketingNotificationsEnabled?: boolean;
        blogNewsNotificationsEnabled?: boolean;
      }
    >({
      query: (body) => ({
        url: '/auth/me',
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['Profile'],
    }),
    requestPhoneOtp: builder.mutation<{ otpRequestId: string; expiresInSeconds: number }, { phoneNumber: string }>({
      query: (body) => ({ url: '/auth/phone/otp', method: 'POST', body }),
    }),
    verifyPhone: builder.mutation<PublicUser, { phoneNumber: string; otpRequestId: string; code: string }>({
      query: (body) => ({ url: '/auth/phone/verify', method: 'POST', body }),
      invalidatesTags: ['Profile'],
    }),
    savePhoneUnverified: builder.mutation<PublicUser, { phoneNumber: string }>({
      query: (body) => ({ url: '/auth/phone', method: 'PATCH', body }),
      invalidatesTags: ['Profile'],
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
    resendEmailVerification: builder.mutation<void, void>({
      query: () => ({ url: '/auth/verify-email/resend', method: 'POST' }),
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
    getDistributorSettings: builder.query<DistributorSettings, void>({
      query: () => '/admin/distributors/settings',
      providesTags: ['DistributorSettings'],
    }),
    updateDistributorSettings: builder.mutation<DistributorSettings, DistributorSettingsInput>({
      query: (body) => ({
        url: '/admin/distributors/settings',
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['DistributorSettings', 'DistributorDashboard'],
    }),
    createDistributorAllocation: builder.mutation<DistributorAllocation, { distributorId: string; tokenAmount: number; discountRate?: number; note?: string }>({
      query: ({ distributorId, ...body }) => ({
        url: `/admin/distributors/${distributorId}/allocations`,
        method: 'POST',
        body,
      }),
      invalidatesTags: ['DistributorDashboard', 'DistributorAllocations', 'DistributorList', 'DistributorActivity', 'Wallet', 'Users'],
    }),
    listDistributorAllocations: builder.query<DistributorAllocationsPage, { distributorId?: string; page?: number; pageSize?: number } | void>({
      query: (params) => ({ url: '/admin/distributors/allocations', params: params ?? undefined }),
      providesTags: ['DistributorAllocations'],
    }),
    listAdminDistributors: builder.query<DistributorAdminSummary[], void>({
      query: () => '/admin/distributors',
      providesTags: ['DistributorList'],
    }),
    getDistributorActivity: builder.query<DistributorActivityPage, { distributorId: string; page?: number; pageSize?: number }>({
      query: ({ distributorId, ...params }) => ({ url: `/admin/distributors/${distributorId}/activity`, params }),
      providesTags: ['DistributorActivity'],
    }),
    getDistributorDashboard: builder.query<DistributorDashboard, void>({
      query: () => '/distributors/dashboard',
      providesTags: ['DistributorDashboard'],
    }),
    getDistributorNetwork: builder.query<DistributorNetwork, void>({
      query: () => '/distributors/network',
      providesTags: ['DistributorDashboard'],
    }),
    promoteSubDistributor: builder.mutation<PromotedSubDistributor, string>({
      query: (userId) => ({ url: `/distributors/sub-distributors/${userId}/promote`, method: 'POST' }),
      invalidatesTags: ['SubDistributorList', 'DistributorDashboard'],
    }),
    listSubDistributors: builder.query<SubDistributorSummary[], void>({
      query: () => '/distributors/sub-distributors',
      providesTags: ['SubDistributorList'],
    }),
    createSubDistributorAllocation: builder.mutation<DistributorAllocation, { subDistributorId: string; tokenAmount: number; discountRate?: number; note?: string }>({
      query: ({ subDistributorId, ...body }) => ({
        url: `/distributors/sub-distributors/${subDistributorId}/allocations`,
        method: 'POST',
        body,
      }),
      invalidatesTags: ['SubDistributorList', 'SubDistributorActivity', 'DistributorDashboard'],
    }),
    getSubDistributorActivity: builder.query<DistributorActivityPage, { subDistributorId: string; page?: number; pageSize?: number }>({
      query: ({ subDistributorId, ...params }) => ({ url: `/distributors/sub-distributors/${subDistributorId}/activity`, params }),
      providesTags: ['SubDistributorActivity'],
    }),
    updateSubDistributorStatus: builder.mutation<{ id: string; status: string }, { id: string; status: string }>({
      query: ({ id, status }) => ({ url: `/distributors/sub-distributors/${id}/status`, method: 'PATCH', body: { status } }),
      invalidatesTags: ['SubDistributorList'],
    }),
    requestSubDistributorAdjustmentOtp: builder.mutation<{ otpRequestId: string; expiresInSeconds: number }, { id: string; amount: number; reference: string }>({
      query: ({ id, ...body }) => ({ url: `/distributors/sub-distributors/${id}/adjustments/otp`, method: 'POST', body }),
    }),
    adjustSubDistributorWallet: builder.mutation<SubDistributorAdjustment, { id: string; amount: number; reference: string; otpRequestId?: string; code?: string }>({
      query: ({ id, ...body }) => ({ url: `/distributors/sub-distributors/${id}/adjustments`, method: 'POST', body }),
      invalidatesTags: ['SubDistributorList', 'SubDistributorActivity'],
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
    getAdminP2PSettings: builder.query<P2PMarketSettings, void>({
      query: () => '/p2p/admin/settings',
      providesTags: ['P2P'],
    }),
    updateAdminP2PSettings: builder.mutation<P2PMarketSettings, Partial<P2PMarketSettings>>({
      query: (body) => ({ url: '/p2p/admin/settings', method: 'PATCH', body }),
      invalidatesTags: ['P2P'],
    }),
    listAdminP2PTrades: builder.query<P2PTrade[], { status?: P2PTradeStatus } | void>({
      query: (params) => ({ url: '/p2p/admin/trades', params: params ?? undefined }),
      providesTags: ['P2P'],
    }),
    listAdminP2PDisputes: builder.query<P2PDispute[], { status?: P2PDisputeStatus } | void>({
      query: (params) => ({ url: '/p2p/admin/disputes', params: params ?? undefined }),
      providesTags: ['P2P'],
    }),
    resolveP2PDispute: builder.mutation<P2PDispute, { id: string; winner: 'buyer' | 'seller'; resolutionNote?: string }>({
      query: ({ id, winner, resolutionNote }) => ({ url: `/p2p/admin/disputes/${id}/resolve`, method: 'POST', body: { winner, resolutionNote } }),
      invalidatesTags: ['P2P', 'Wallet'],
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
    getAdminUser: builder.query<PublicUser, string>({
      query: (id) => `/auth/admin/users/${id}`,
      providesTags: (_result, _error, id) => [{ type: 'Users', id }],
    }),
    getUserActivity: builder.query<UserActivityPage, { userId: string; page?: number; pageSize?: number }>({
      query: ({ userId, ...params }) => ({ url: `/auth/admin/users/${userId}/activity`, params }),
      providesTags: (_result, _error, { userId }) => [{ type: 'Users', id: `${userId}-activity` }],
    }),
    requestUserLockOtp: builder.mutation<{ otpRequestId: string; expiresInSeconds: number }, { id: string; status: string }>({
      query: ({ id, status }) => ({ url: `/auth/admin/users/${id}/lock/otp`, method: 'POST', body: { status } }),
    }),
    lockUser: builder.mutation<PublicUser, { id: string; status: string; otpRequestId?: string; code?: string }>({
      query: ({ id, ...body }) => ({ url: `/auth/admin/users/${id}/lock`, method: 'POST', body }),
      invalidatesTags: (_result, _error, { id }) => ['Users', { type: 'Users', id }],
    }),
    requestUserDeleteOtp: builder.mutation<{ otpRequestId: string; expiresInSeconds: number }, string>({
      query: (id) => ({ url: `/auth/admin/users/${id}/delete/otp`, method: 'POST' }),
    }),
    deleteUser: builder.mutation<{ id: string; deleted: boolean }, { id: string; otpRequestId?: string; code?: string }>({
      query: ({ id, ...body }) => ({ url: `/auth/admin/users/${id}/delete`, method: 'POST', body }),
      invalidatesTags: ['Users'],
    }),
    requestTrainingPayoutOtp: builder.mutation<
      { otpRequestId: string; expiresInSeconds: number },
      { userId: string; tokenAmount: number; reference: string }
    >({
      query: (body) => ({ url: '/admin/training-payouts/otp', method: 'POST', body }),
    }),
    createTrainingPayout: builder.mutation<
      { userId: string; reference: string; amount: string },
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
    resetCountryExchangeRate: builder.mutation<AdminCountry, string>({
      query: (id) => ({ url: `/geo/admin/countries/${id}/reset-exchange-rate`, method: 'POST' }),
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
    generateDialectKeyboardLayout: builder.mutation<{ keyboardLayout: string }, string>({
      query: (id) => ({ url: `/geo/admin/dialects/${id}/generate-keyboard-layout`, method: 'POST' }),
    }),
    getAdminDialectVariants: builder.query<AdminDialectVariant[], string>({
      query: (dialectId) => `/geo/admin/dialects/${dialectId}/variants`,
      providesTags: (_result, _error, dialectId) => [{ type: 'AdminDialects', id: `${dialectId}-variants` }],
    }),
    createDialectVariant: builder.mutation<AdminDialectVariant, { dialectId: string; body: DialectVariantInput }>({
      query: ({ dialectId, body }) => ({ url: `/geo/admin/dialects/${dialectId}/variants`, method: 'POST', body }),
      invalidatesTags: (_result, _error, { dialectId }) => [{ type: 'AdminDialects', id: `${dialectId}-variants` }],
    }),
    updateDialectVariant: builder.mutation<AdminDialectVariant, { id: string; dialectId: string; body: Partial<DialectVariantInput> }>({
      query: ({ id, body }) => ({ url: `/geo/admin/dialect-variants/${id}`, method: 'PATCH', body }),
      invalidatesTags: (_result, _error, { dialectId }) => [{ type: 'AdminDialects', id: `${dialectId}-variants` }],
    }),
    deleteDialectVariant: builder.mutation<{ id: string; deleted: boolean }, { id: string; dialectId: string }>({
      query: ({ id }) => ({ url: `/geo/admin/dialect-variants/${id}`, method: 'DELETE' }),
      invalidatesTags: (_result, _error, { dialectId }) => [{ type: 'AdminDialects', id: `${dialectId}-variants` }],
    }),
    getPlatformSettings: builder.query<PlatformSettings, void>({
      query: () => '/admin/platform-settings',
      providesTags: ['PlatformSettings'],
    }),
    getPublicClientSettings: builder.query<PublicClientSettings, void>({
      query: () => '/settings/public',
    }),
    updatePlatformSettings: builder.mutation<PlatformSettings, PlatformSettingsInput>({
      query: (body) => ({
        url: '/admin/platform-settings',
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['PlatformSettings'],
    }),
    getAdminWords: builder.query<AdminWordsPage, { page: number; pageSize: number; search?: string; partOfSpeech?: PartOfSpeech }>({
      query: ({ page, pageSize, search, partOfSpeech }) => ({ url: '/words/admin', params: { page, pageSize, search, partOfSpeech } }),
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
    getAdminCourses: builder.query<Course[], void>({
      query: () => '/courses/admin/courses',
      providesTags: ['Courses'],
    }),
    getAdminCourse: builder.query<Course, string>({
      query: (id) => `/courses/admin/courses/${id}`,
      providesTags: (_result, _error, id) => [{ type: 'Courses', id }],
    }),
    createCourse: builder.mutation<Course, CourseInput>({
      query: (body) => ({ url: '/courses/admin/courses', method: 'POST', body }),
      invalidatesTags: ['Courses'],
    }),
    updateCourse: builder.mutation<Course, { id: string; body: Partial<CourseInput> }>({
      query: ({ id, body }) => ({ url: `/courses/admin/courses/${id}`, method: 'PATCH', body }),
      invalidatesTags: (_result, _error, { id }) => ['Courses', { type: 'Courses', id }],
    }),
    deleteCourse: builder.mutation<{ id: string; deleted: boolean }, string>({
      query: (id) => ({ url: `/courses/admin/courses/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Courses'],
    }),
    reorderCourses: builder.mutation<{ reordered: number }, { items: { id: string; sortOrder: number }[] }>({
      query: (body) => ({ url: '/courses/admin/courses/reorder', method: 'PATCH', body }),
      invalidatesTags: ['Courses'],
    }),
    createCourseMediaUpload: builder.mutation<CourseMediaUpload, { fileName: string; contentType: string; kind: 'IMAGE' | 'AUDIO' }>({
      query: (body) => ({ url: '/courses/admin/media/upload-url', method: 'POST', body }),
    }),
    getCourseToStudy: builder.query<CourseStudy, string>({
      query: (slug) => `/courses/study/${slug}`,
      providesTags: (_result, _error, slug) => [{ type: 'Courses', id: slug }],
    }),
    saveCourseProgress: builder.mutation<CourseProgress, { slug: string; lastSlideIndex: number; totalSlides: number }>({
      query: ({ slug, ...body }) => ({ url: `/courses/study/${slug}/progress`, method: 'PUT', body }),
    }),
  }),
});

export const {
  useRegisterMutation,
  useSendReferralInviteMutation,
  useRequestMagicLinkMutation,
  useRequestPasswordResetMutation,
  useResetPasswordMutation,
  useVerifyEmailMutation,
  useResendEmailVerificationMutation,
  useGetCountriesQuery,
  useGetDialectsQuery,
  useGetDialectVariantsQuery,
  useGetWalletQuery,
  useGetP2PSettingsQuery,
  useGetP2PReferenceRateQuery,
  useGetP2PPaymentMethodsQuery,
  useRequestP2PPaymentMethodOtpMutation,
  useCreateP2PPaymentMethodMutation,
  useUpdateP2PPaymentMethodMutation,
  useListP2POffersQuery,
  useListMyP2POffersQuery,
  useGetP2PTraderProfileQuery,
  useRequestP2PTradeOtpMutation,
  useCreateP2POfferMutation,
  useAcceptP2POfferMutation,
  useCancelP2POfferMutation,
  useListMyP2PTradesQuery,
  useMarkP2PTradePaidMutation,
  useRequestP2PTradeCancelMutation,
  useReleaseP2PTradeMutation,
  useRaiseP2PDisputeMutation,
  useGetTrainerDashboardQuery,
  useGetEarningHistoryQuery,
  useGetWalletActivityQuery,
  useGetEarningsChartQuery,
  useGetMySubmissionsQuery,
  useGetMyWordRecordingsQuery,
  useStartWordTrainingSessionMutation,
  useLazyGetNextWordTrainingAssignmentQuery,
  useLazyGetSpellingSuggestionsQuery,
  useEndWordTrainingSessionMutation,
  useCreateWordRecordingUploadMutation,
  useSubmitWordRecordingMutation,
  useRequestDepositOtpMutation,
  useCreateTokenDepositMutation,
  useRequestWithdrawalOtpMutation,
  useCreateWithdrawalMutation,
  useListAdminWithdrawalsQuery,
  useRequestWithdrawalResolveOtpMutation,
  useApproveWithdrawalMutation,
  useSubmitWithdrawalToNowPaymentsMutation,
  useVerifyWithdrawalPayoutMutation,
  useRefreshWithdrawalStatusMutation,
  useResolveWithdrawalMutation,
  useGetMeQuery,
  useUpdateProfileMutation,
  useRequestPhoneOtpMutation,
  useVerifyPhoneMutation,
  useSavePhoneUnverifiedMutation,
  useCreateDataAccessLeadMutation,
  useGetAdminDataAccessLeadsQuery,
  useUpdateAdminDataAccessLeadContactMutation,
  useGetReferralSettingsQuery,
  useUpdateReferralSettingsMutation,
  useGetReferralsQuery,
  useGetDistributorSettingsQuery,
  useUpdateDistributorSettingsMutation,
  useCreateDistributorAllocationMutation,
  useListDistributorAllocationsQuery,
  useListAdminDistributorsQuery,
  useGetDistributorActivityQuery,
  useGetDistributorDashboardQuery,
  useGetDistributorNetworkQuery,
  usePromoteSubDistributorMutation,
  useListSubDistributorsQuery,
  useCreateSubDistributorAllocationMutation,
  useGetSubDistributorActivityQuery,
  useUpdateSubDistributorStatusMutation,
  useRequestSubDistributorAdjustmentOtpMutation,
  useAdjustSubDistributorWalletMutation,
  useGetPoolsSummaryQuery,
  useListSubscriptionPoolsQuery,
  useCreateSubscriptionPoolMutation,
  useCloseSubscriptionPoolMutation,
  useUpdateSubscriptionPoolMutation,
  useDeleteSubscriptionPoolMutation,
  useGetAdminStatsQuery,
  useGetAdminP2PSettingsQuery,
  useUpdateAdminP2PSettingsMutation,
  useListAdminP2PTradesQuery,
  useListAdminP2PDisputesQuery,
  useResolveP2PDisputeMutation,
  useGetUsersQuery,
  useUpdateUserRoleMutation,
  useUpdateUserStatusMutation,
  useGetAdminUserQuery,
  useGetUserActivityQuery,
  useRequestUserLockOtpMutation,
  useLockUserMutation,
  useRequestUserDeleteOtpMutation,
  useDeleteUserMutation,
  useRequestTrainingPayoutOtpMutation,
  useCreateTrainingPayoutMutation,
  useGetAdminCountriesQuery,
  useCreateCountryMutation,
  useUpdateCountryMutation,
  useDeleteCountryMutation,
  useResetCountryExchangeRateMutation,
  useGetAdminDialectsQuery,
  useGetAdminDialectVariantsQuery,
  useCreateDialectVariantMutation,
  useUpdateDialectVariantMutation,
  useDeleteDialectVariantMutation,
  useCreateDialectMutation,
  useUpdateDialectMutation,
  useDeleteDialectMutation,
  useGenerateDialectKeyboardLayoutMutation,
  useGetPlatformSettingsQuery,
  useGetPublicClientSettingsQuery,
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
  useGetAdminCoursesQuery,
  useGetAdminCourseQuery,
  useCreateCourseMutation,
  useUpdateCourseMutation,
  useDeleteCourseMutation,
  useReorderCoursesMutation,
  useCreateCourseMediaUploadMutation,
  useGetCourseToStudyQuery,
  useSaveCourseProgressMutation,
} = dialectivaApi;

export { normalizeErrorMessage };

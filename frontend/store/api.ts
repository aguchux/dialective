import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import type { BaseQueryFn } from '@reduxjs/toolkit/query/react';
import { PUBLIC_API_V1_BASE_URL } from '@/lib/public-api';
import { getCurrentSession } from '@/lib/client-session';
import { notifyAuthMaintenance } from '@/lib/auth-maintenance-signal';

export type KycStatus =
  'NOT_STARTED' | 'IN_PROGRESS' | 'IN_REVIEW' | 'APPROVED' | 'DECLINED' | 'ABANDONED' | 'EXPIRED';
export type TrainerRating = 'VERY_BAD' | 'BAD' | 'GOOD' | 'VERY_GOOD' | 'EXCELLENT';

export interface PublicUser {
  id: string;
  firstName: string | null;
  lastName: string | null;
  gender: 'MALE' | 'FEMALE' | null;
  email: string;
  role: 'TRAINER' | 'ADMIN' | 'PARTNER' | 'DISTRIBUTOR' | 'VALIDATOR';
  status: 'ACTIVE' | 'SUSPENDED' | 'BLOCKED';
  trainerRating: TrainerRating | null;
  trainerRatingValue: number | null;
  validatorLevel: 'L1' | 'L2' | 'L3' | null;
  emailVerified: boolean;
  phoneNumber: string | null;
  phoneVerified: boolean;
  kycStatus: KycStatus;
  kycVerifiedAt: string | null;
  originCountryId: string | null;
  countryId: string | null;
  dialectId: string | null;
  dialectTag: string | null;
  dialectVariantId: string | null;
  dialectVariantTag: string | null;
  onboardingComplete: boolean;
  referralCode: string;
  emailNotificationsEnabled: boolean;
  smsNotificationsEnabled: boolean;
  twoFactorEmailEnabled: boolean;
  twoFactorSmsEnabled: boolean;
  marketingNotificationsEnabled: boolean;
  blogNewsNotificationsEnabled: boolean;
  courseNotificationsEnabled: boolean;
  pwaInstalledAt: string | null;
  walletBalance?: string;
  walletLockedBalance?: string;
  walletTotalBalance?: string;
  pendingScoringTokens?: string;
  pendingScoringCount?: number;
  submissionsCount?: number;
  wordRecordingsCount?: number;
  auditHoldAt: string | null;
  auditHoldReleasedAt: string | null;
  onAuditHold: boolean;
  potentialDuplicateNameMatches?: Array<{
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
    phoneNumber: string | null;
    phoneVerified: boolean;
    status: 'ACTIVE' | 'SUSPENDED' | 'BLOCKED';
    kycStatus: KycStatus;
  }>;
}

export interface PendingOtp {
  otpRequired: true;
  ticket: string;
  expiresInSeconds: number;
}

export type SystemUpdateKind = 'MAINTENANCE' | 'COURSE' | 'BLOG' | 'MESSAGE';

export interface UserNotification {
  id: string;
  readAt: string | null;
  createdAt: string;
  update: {
    id: string;
    kind: SystemUpdateKind;
    title: string;
    message: string;
    href: string | null;
    createdAt: string;
  };
}

export interface NotificationsPage {
  items: UserNotification[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  unreadCount: number;
}

export interface AdminSystemUpdate {
  id: string;
  kind: SystemUpdateKind;
  sourceType: 'MANUAL' | 'BLOG_POST' | 'COURSE';
  sourceId: string | null;
  title: string;
  message: string;
  href: string | null;
  pushToBanner: boolean;
  createdAt: string;
  author: { email: string; firstName: string | null; lastName: string | null } | null;
  _count: { notifications: number };
  readCount: number;
}

export interface BannerUpdate {
  id: string;
  kind: SystemUpdateKind;
  title: string;
  message: string;
  href: string | null;
  createdAt: string;
}

export interface AdminSmsContact {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  phoneNumber: string;
  phoneVerified: boolean;
  smsNotificationsEnabled: boolean;
  status: 'ACTIVE' | 'SUSPENDED' | 'BLOCKED';
}

export interface AdminSmsContactsPage {
  items: AdminSmsContact[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface AdminSmsMessage {
  id: string;
  body: string;
  status: 'SENT' | 'FAILED';
  failureReason: string | null;
  provider: string | null;
  createdAt: string;
  sender: { firstName: string | null; lastName: string | null; email: string } | null;
}

export interface AdminSmsMessagesPage {
  items: AdminSmsMessage[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export type SmsProviderKey = 'termii' | 'twilio' | 'africastalking' | 'smslive247';
export const ALL_SMS_PROVIDER_KEYS: SmsProviderKey[] = [
  'termii',
  'twilio',
  'africastalking',
  'smslive247',
];

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

export interface DialectSummary {
  tag: string;
  name: string;
}

export interface DialectVariant {
  id: string;
  tag: string;
  name: string;
}

export interface AdminDialectVariant extends DialectVariant {
  active: boolean;
  tasksPaused: boolean;
  _count: { users: number; wordRecordings: number };
}

export interface AdminDialectVariantFlat extends AdminDialectVariant {
  dialect: { id: string; name: string; tag: string; country: { name: string } };
}

export interface DialectVariantInput {
  tag: string;
  name: string;
  active?: boolean;
  tasksPaused?: boolean;
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
  active: boolean;
  tasksPaused: boolean;
  llmGenerationEnabled: boolean;
  keyboardLayout: string | null;
  country: { id: string; name: string; code: string };
  _count: { users: number };
}

export interface AudioRetentionRule {
  id: string;
  enabled: boolean;
  countryId: string | null;
  country: { id: string; name: string; code: string } | null;
  dialectTag: string | null;
  retentionDays: number;
  createdAt: string;
  updatedAt: string;
}

export interface AudioRetentionRuleInput {
  enabled?: boolean;
  countryId?: string | null;
  dialectTag?: string | null;
  retentionDays: number;
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
  active?: boolean;
  tasksPaused?: boolean;
  llmGenerationEnabled?: boolean;
  keyboardLayout?: string;
}

export interface DataAccessLeadInterestInput {
  countryId: string;
  dialectTags: string[];
  subdialectTags: string[];
}

export interface DataAccessLeadInput {
  firstName: string;
  lastName: string;
  email: string;
  organization: string;
  website: string;
  interests: DataAccessLeadInterestInput[];
}

export interface DataAccessLeadInterest {
  id: string;
  countryId: string;
  country: { id: string; code: string; name: string };
  dialectTags: string[];
  subdialectTags: string[];
}

export interface AdminDataAccessLead {
  id: string;
  firstName: string;
  lastName: string;
  name: string;
  email: string;
  organization: string | null;
  website: string | null;
  interests: DataAccessLeadInterest[];
  contactedAt: string | null;
  contactNote: string | null;
  contactedByUserId: string | null;
  contactedBy: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  } | null;
  invitedOrganizationId: string | null;
  invitedOrganization: { id: string; name: string } | null;
  signedUpDirectly: boolean;
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

export interface DataAccessLeadInviteInput {
  organizationName: string;
  planId: string;
}

export interface SupportRequestInput {
  name: string;
  email: string;
  subject: string;
  message: string;
}

export interface AdminSupportRequest {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  resolvedAt: string | null;
  resolutionNote: string | null;
  resolvedByUserId: string | null;
  resolvedBy: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  } | null;
  createdAt: string;
}

export interface SupportRequestsPage {
  items: AdminSupportRequest[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface SupportRequestResolutionUpdateInput {
  resolved: boolean;
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

export interface ReferralInvitationPage {
  items: {
    id: string;
    firstName: string | null;
    email: string;
    createdAt: string;
    status: 'INVITED' | 'JOINED';
  }[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface AdminAssistantConversationSummary {
  id: string;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
    role: string;
  };
  _count: { messages: number };
  latestMessage: { content: string; role: 'user' | 'assistant'; createdAt: string } | null;
}

export interface AdminAssistantConversationPage {
  items: AdminAssistantConversationSummary[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface AdminAssistantConversationDetail {
  id: string;
  createdAt: string;
  updatedAt: string;
  user: AdminAssistantConversationSummary['user'];
  _count: { messages: number };
  messages: Array<{
    id: string;
    role: 'user' | 'assistant';
    content: string;
    createdAt: string;
    convertedToFaqId: string | null;
    githubIssueNumber: number | null;
    githubIssueUrl: string | null;
    githubIssueCreatedAt: string | null;
  }>;
  truncated: boolean;
}

export interface AdminFaq {
  id: string;
  question: string;
  answer: string;
  visible: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  createdBy: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
  } | null;
}

export interface FaqInput {
  question: string;
  answer: string;
  /** Set when creating this FAQ from an AI-conversation user message. */
  sourceMessageId?: string;
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
export type WithdrawalStatus =
  'PENDING' | 'APPROVED' | 'PROCESSING' | 'PAID' | 'FAILED' | 'REJECTED';

export interface AdminWithdrawalRequest {
  id: string;
  walletId: string;
  wallet: {
    user: {
      email: string;
      firstName: string | null;
      lastName: string | null;
      phoneNumberMasked: string | null;
      phoneVerified: boolean;
      kycStatus: KycStatus;
      settledTaskCount: number;
    };
  };
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
  payoutMethod?: PayoutMethod;
  destinationBankCode?: string | null;
  destinationBankName?: string | null;
  destinationAccountNumberMasked?: string | null;
  destinationAccountName?: string | null;
  destinationMobileNetwork?: string | null;
  destinationMobileNumberMasked?: string | null;
  destinationCountry?: string | null;
  fiatAmount?: string | null;
  fiatUsdExchangeRate?: string | null;
}

// CRYPTO_SAVED withdraws to a saved STABLECOIN_WALLET PayoutAccount (address
// resolved server-side); CRYPTO takes a freshly-typed destinationAddress
// every time. See request-withdrawal-otp.dto.ts's doc comment.
export type PayoutMethod = 'CRYPTO' | 'CRYPTO_SAVED' | 'BANK' | 'MOBILE_MONEY' | 'STRIPE';
export type PayoutAccountType = 'BANK' | 'MOBILE_MONEY' | 'STABLECOIN_WALLET' | 'STRIPE_CONNECT';
export type PayoutAccountVerificationStatus = 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'FAILED';

export interface PayoutAccount {
  id: string;
  type: PayoutAccountType;
  country: string;
  currency: string;
  provider: string;
  isDefault: boolean;
  verificationStatus: PayoutAccountVerificationStatus;
  bankCode: string | null;
  bankName: string | null;
  accountNumberMasked: string | null;
  accountName: string | null;
  mobileMoneyNetwork: string | null;
  mobileMoneyNumberMasked: string | null;
  stripeConnectAccountId: string | null;
  stripeDetailsSubmitted: boolean;
  stripePayoutsEnabled: boolean;
  stablecoinAsset: string | null;
  stablecoinNetwork: string | null;
  walletAddressMasked: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

export interface PaymentMethodCatalogEntry {
  id: string;
  countryCode: string;
  type: PayoutAccountType;
  name: string;
  description: string | null;
  logoUrl: string | null;
  bankCode: string | null;
  enabled: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface KycVerification {
  id: string;
  userId: string;
  user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    phoneNumber: string | null;
  };
  provider: string;
  status: KycStatus;
  documentType: string | null;
  documentNumberMasked: string | null;
  faceMatchScore: string | null;
  livenessScore: string | null;
  declineReason: string | null;
  webhookReceivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface KycVerificationList {
  items: KycVerification[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export type ReserveHealthStatus = 'HEALTHY' | 'WATCH' | 'RESTRICTED' | 'CRITICAL';

export interface TokenomicsSupply {
  totalMinted: number;
  circulating: number;
  treasury: number;
  locked: number;
  burned: number;
  redeemable: number;
}

export interface ReserveBalanceRow {
  provider: string;
  currency: string;
  balanceRaw: string;
  balanceUsd: string;
  fetchedAt: string;
}

export interface TokenomicsStatus {
  baseCurrency: string;
  enabled: boolean;
  mintingPaused: boolean;
  eligibleReserveUsd: number;
  publishedValueUsd: number;
  pinnedValueUsd: number | null;
  rawValueUsd: number | null;
  coverageRatio: number | null;
  reserveHealthStatus: ReserveHealthStatus;
  supply: TokenomicsSupply;
  lastValuationAt: string | null;
  reserveBalances: ReserveBalanceRow[];
  reserveBalancesFetchedAt: string | null;
}

export interface ValuationSnapshotRow {
  id: string;
  publishedValueUsd: string;
  rawValueUsd: string;
  coverageRatio: string | null;
  eligibleReserveUsd: string;
  redeemableSupply: string;
  createdAt: string;
}

export interface ReserveTransactionRow {
  id: string;
  type: string;
  status: string;
  direction: 'CREDIT' | 'DEBIT';
  amount: string;
  eligibleUsdAmount: string;
  providerReference: string | null;
  sourceReference: string | null;
  reason: string | null;
  createdAt: string;
  settledAt: string | null;
  reserveAccount: { provider: string; asset: string; network: string; currency: string };
}

export interface TokenLedgerEntryRow {
  id: string;
  accountId: string;
  availableDelta: string;
  lockedDelta: string;
  createdAt: string;
  account: { code: string; kind: 'USER' | 'TREASURY' | 'BURN' };
}

export interface TokenOperationRow {
  id: string;
  type: string;
  status: string;
  reference: string | null;
  reason: string | null;
  createdAt: string;
  settledAt: string | null;
  entries: TokenLedgerEntryRow[];
}

export interface PaginatedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface TokenomicsPolicy {
  id: string;
  baseCurrency: string;
  enabled: boolean;
  mintingPaused: boolean;
  valuationIntervalMinutes: number;
  maxIncreaseRate: string;
  maxDecreaseRate: string;
  healthyCoverageThreshold: string;
  watchCoverageThreshold: string;
  restrictedCoverageThreshold: string;
  pinnedValueUsd: string | null;
  updatedAt: string;
  createdAt: string;
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
  | 'ADMIN_ADJUSTMENT'
  | 'STARTUP_BONUS'
  | 'COURSE_COMPLETION_REWARD'
  | 'TESTIMONY_APPROVED_REWARD'
  | 'PHONE_VERIFICATION_FEE'
  | 'PHONE_VERIFICATION_FEE_REFUND'
  | 'P2P_ESCROW_LOCK'
  | 'P2P_ESCROW_REFUND'
  | 'P2P_ESCROW_RELEASE'
  | 'P2P_ESCROW_CREDIT'
  | 'VALIDATION_REWARD'
  | 'WHATSAPP_VALIDATION_FEE'
  | 'WHATSAPP_VALIDATION_PAYOUT'
  | 'NO_AUDIO_BONUS_CLAWBACK';

export type P2POfferType = 'SELL' | 'BUY';
export type P2POfferStatus =
  'ACTIVE' | 'RESERVED' | 'EXPIRED' | 'CANCELLED' | 'COMPLETED' | 'DISPUTED';
export type P2PTradeStatus =
  | 'AWAITING_PAYMENT'
  | 'PAID_MARKED'
  | 'RELEASED'
  | 'CANCEL_PENDING'
  | 'CANCELLED'
  | 'DISPUTED'
  | 'EXPIRED'
  // Transitional, held only while a release/refund moves the escrow. A trade
  // seen sitting in this state means a resolution crashed mid-flight.
  | 'SETTLING';
export type P2PDisputeStatus = 'OPEN' | 'RESOLVED_BUYER' | 'RESOLVED_SELLER';

export interface Integration {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  iconKey: string | null;
  feeTokenAmount: string;
  /**
   * What one fulfiller actually receives. On ID Review the requester's fee
   * is split between the reviewers who decide, so this is the fee divided
   * by the consensus count -- use it, not feeTokenAmount, for "you earn".
   */
  earningPerFulfilment: string;
  /** True only when an admin has APPROVED the request -- i.e. real access. */
  subscribed: boolean;
  /** null when never requested. PENDING means waiting on an admin, not access. */
  subscriptionStatus: IntegrationSubscriptionStatus | null;
  /** Whether this member may request access at all (see eligibilityRequirements). */
  eligible: boolean;
  /**
   * The full bar for this integration, met or not, so the card can show
   * what is required before the member tries. Empty when open to all.
   */
  eligibilityRequirements: { label: string; met: boolean }[];
}

export type IntegrationSubscriptionStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface AdminIntegrationSubscription {
  id: string;
  status: IntegrationSubscriptionStatus;
  subscribedAt: string;
  reviewedAt: string | null;
  reviewNote: string | null;
  /** Staff-grade: sees documents unobscured and decides outright. */
  certified: boolean;
  certifiedAt: string | null;
  integration: { id: string; slug: string; name: string };
  user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    phoneNumber: string | null;
    phoneVerified: boolean;
    kycStatus: KycStatus;
    /** Lifetime completed word recordings. */
    taskCount: number;
  };
}

// --- Peer review of identity documents (p2p-kyc-review integration) ---

export interface PeerReviewQueueItem {
  id: string;
  documentType: string | null;
  submittedAt: string;
  reviewsSoFar: number;
  /** The name on the account, to match against the name on the card. */
  accountName: string;
}

export interface PeerReviewSubject {
  id: string;
  documentType: string | null;
  /** When true the client shows the document plainly, with no magnifier. */
  certifiedReviewer: boolean;
  accountName: string;
  accountNameParts: string[];
  evidence: { id: string; kind: string }[];
  claimExpiresAt: string;
}

export interface PeerReviewTally {
  /** True when a certified reviewer's verdict settled it on the spot. */
  decidedByCertifiedReviewer?: boolean;
  reviewCount: number;
  approvals: number;
  declines: number;
  /** Agreeing verdicts needed to decide, from Integration.consensusCount. */
  consensusCount: number;
  needsAnotherReviewer: boolean;
  /**
   * Enough peers agreed, so the verification has been DECIDED -- the
   * applicant's KYC status is already moved. Named for the era when this
   * meant "queued for an admin"; kept for wire compatibility.
   */
  readyForAdmin: boolean;
  recommendation: 'APPROVE' | 'DECLINE' | null;
}

export interface MyPeerReview {
  id: string;
  verdict: 'APPROVE' | 'DECLINE';
  /** null when the document carries no number to compare. */
  documentNumberMatched: boolean | null;
  paidAt: string | null;
  createdAt: string;
  kycVerification: { id: string; status: string };
}

export interface AdminPeerReviewItem {
  id: string;
  documentType: string | null;
  submittedAt: string;
  user: { id: string; email: string; firstName: string | null; lastName: string | null };
  reviews: {
    id: string;
    verdict: 'APPROVE' | 'DECLINE';
    /** null when the document carries no number to compare. */
    documentNumberMatched: boolean | null;
    declineReason: string | null;
    createdAt: string;
    reviewer: { id: string; email: string; firstName: string | null; lastName: string | null };
  }[];
  approvals: number;
  declines: number;
  /** Agreeing verdicts needed to decide, from Integration.consensusCount. */
  consensusCount: number;
  /**
   * Consensus was reached but the verification is still IN_REVIEW, meaning
   * auto-apply failed and a human has to finish it. Not a "recommendation"
   * -- on the normal path a decided document never appears in this queue.
   */
  readyForAdmin: boolean;
  recommendation: 'APPROVE' | 'DECLINE' | null;
}

export interface AdminIntegration {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  iconKey: string | null;
  enabled: boolean;
  feeTokenAmount: string;
  // How many open claims a single subscribed member may hold on this
  // integration at once (e.g. concurrent WhatsApp Validator requests).
  maxConcurrentClaims: number;
  /** PENDING access requests waiting on an admin for this integration. */
  pendingSubscriptionCount: number;
  // How long an issued verification code/request stays valid before
  // expiring, in minutes.
  codeValidityMinutes: number;
  // Agreeing peer verdicts that decide an item outright, with no admin
  // step -- on ID Review this applies the verdict to the applicant's KYC
  // status directly.
  consensusCount: number;
  // Who may REQUEST access. Enforced on subscribe and shown on the
  // marketplace card; all three off means open to anyone.
  requirePhoneVerified: boolean;
  requireKycApproved: boolean;
  /** Settled tasks required. 0 switches the task bar off. */
  minCompletedTasks: number;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export type WhatsAppValidationRequestStatus =
  'PENDING' | 'CLAIMED' | 'VERIFIED' | 'REJECTED' | 'EXPIRED' | 'CANCELLED';

export interface WhatsAppValidationRequestResult {
  requestId: string;
  code: string;
  feeTokenAmount: string;
  expiresAt: string;
}

export interface WhatsAppValidationMyRequest {
  id: string;
  phoneNumber: string;
  status: WhatsAppValidationRequestStatus;
  feeTokenAmount: string;
  verifiedAt: string | null;
  rejectedAt: string | null;
  expiresAt: string;
  createdAt: string;
  // Set once a validator has claimed this request -- lets the requester
  // reach out first instead of only waiting to be contacted, and confirm
  // (name + number together) they're messaging the right person, not
  // someone impersonating the claimant. Null while PENDING, or if the
  // claiming validator has no phone number on file.
  validatorPhoneNumber: string | null;
  validatorFirstName: string | null;
  validatorLastName: string | null;
}

export interface WhatsAppValidationClaim {
  id: string;
  phoneNumber: string;
  status: WhatsAppValidationRequestStatus;
  feeTokenAmount: string;
  attempts: number;
  maxAttempts: number;
  claimedAt: string | null;
  claimExpiresAt: string | null;
  verifiedAt: string | null;
  createdAt: string;
  // Shown alongside the phone number so a validator can confirm they're
  // about to message the right account before/while verifying -- guards
  // against a phishing attempt where a scammer's number is passed off as
  // belonging to the request.
  requesterFirstName: string | null;
  requesterLastName: string | null;
}

export interface WhatsAppValidationPendingPage {
  items: WhatsAppValidationClaim[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * What this member may do on the market. Advisory -- every gate is also
 * enforced server-side on the action itself. Selling is the stricter
 * side: everything buying needs, plus a settled-task track record.
 */
export interface P2PTradingEligibility {
  canBuy: boolean;
  canSell: boolean;
  phoneVerified: boolean;
  kycApproved: boolean;
  completedTasks: number;
  /** 0 when an admin has switched the task requirement off. */
  minCompletedTasksForSelling: number;
}

export interface P2PMarketSettings {
  enabled: boolean;
  sellOffersEnabled: boolean;
  buyRequestsEnabled: boolean;
  minTradeTokens: string;
  maxTradeTokens: string;
  paymentWindowMinutes: number;
  cancelGraceMinutes: number;
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
  tokenUsdPrice: string;
  updatedAt: string | null;
  availableCurrencies: Array<{
    currencyCode: string;
    tokenReferencePrice: string;
    updatedAt: string | null;
  }>;
}

export interface P2POffer {
  id: string;
  type: P2POfferType;
  userId: string;
  user?: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    /** Derived server-side from phoneVerifiedAt -- the raw timestamp is never exposed to other traders. */
    phoneVerified: boolean;
    /** Derived server-side from kycStatus === 'APPROVED' -- the raw status is never exposed to other traders. */
    kycVerified: boolean;
    country: { code: string; name: string } | null;
  };
  /** RELEASED-trade count for this offer's owner, batched server-side -- only populated on the market list (listOffers), undefined elsewhere (create/accept/cancel a single offer). */
  completedSaleCount?: number;
  tokenAmount: string;
  remainingTokens: string;
  usdAmount: string;
  fiatAmount: string;
  fiatCurrency: string;
  paymentMethod: string;
  paymentMethodDetails: PayoutAccount | null;
  /** The seller's full set of acceptable receive-accounts, visible to any viewer -- lets a buyer pick one when accepting a SELL offer with more than one option. See P2PService.summarizePaymentMethod. */
  paymentMethods: { id: string; type: PayoutAccountType; label: string; verified: boolean }[];
  status: P2POfferStatus;
  /** Distinct traders who have opened this offer's detail page. The poster's own visits are not counted. */
  viewCount: number;
  /** null for a standing post -- offers no longer expire, they stay listed until the owner takes them down. */
  expiresAt: string | null;
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

/**
 * P2PTrade-only: unlike PayoutAccount elsewhere (e.g. the trainer's own "my
 * payout accounts" list, where only the masked form is ever returned), a
 * trade's buyer needs the REAL account number to actually pay the seller --
 * see P2PService.serializeTrade's decryptForParticipant. accountNumber/
 * mobileMoneyNumber are null only if decryption failed server-side; the
 * *Masked fields are always still present as a fallback for display.
 */
export interface P2PSellerPaymentMethod extends PayoutAccount {
  accountNumber: string | null;
  mobileMoneyNumber: string | null;
}

export interface P2PTradeCounterparty {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  /** Only ever populated for the OTHER party in a trade -- see P2PService.serializeTrade's withPhoneIfViewerIsCounterparty. Null for your own side, and whenever this trade hasn't matched you with this person. */
  phoneNumber: string | null;
}

export interface P2PTrade {
  id: string;
  offerId: string;
  offerType: P2POfferType;
  buyerId: string;
  sellerId: string;
  buyer: P2PTradeCounterparty;
  seller: P2PTradeCounterparty;
  tokenAmount: string;
  usdAmount: string;
  fiatAmount: string;
  fiatCurrency: string;
  paymentMethod: string;
  sellerPaymentMethod: P2PSellerPaymentMethod | null;
  sellerPaymentInstructions: string | null;
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

export interface P2PTradeMessage {
  id: string;
  tradeId: string;
  senderId: string;
  /** True only when the sender is an admin acting in an admin capacity (not a trade participant who happens to hold the admin role) -- see P2PChatService.sendMessage. */
  isFromAdmin: boolean;
  body: string | null;
  hasAttachment: boolean;
  attachmentContentType: string | null;
  createdAt: string;
  sender: { id: string; firstName: string | null; lastName: string | null; email: string };
}

export interface P2PDisputeParty {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phoneNumber: string | null;
}

export interface P2PDispute {
  id: string;
  status: P2PDisputeStatus;
  reason: string;
  evidenceUrl: string | null;
  resolutionNote: string | null;
  createdAt: string;
  resolvedAt: string | null;
  raisedBy: P2PDisputeParty;
  /** The trade party who did NOT raise this dispute -- derived server-side, see P2PService.adminListDisputes. */
  defaulter: P2PDisputeParty;
  trade: P2PTrade;
}

export interface CommunityStats {
  memberCount: number;
  postCount: number;
  spaceCount: number;
  postsLast24h: number;
}

export interface AdminCommunitySpace {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  rules: string | null;
  isArchived: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  _count: { posts: number; memberships: number };
}

export interface UpsertCommunitySpaceInput {
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  rules?: string;
  isArchived?: boolean;
  sortOrder?: number;
}

export interface AdminCommunityTag {
  id: string;
  name: string;
  slug: string;
  isHidden: boolean;
  createdAt: string;
}

export type CommunityMemberStatus = 'ACTIVE' | 'SUSPENDED' | 'BANNED';
export type CommunityMemberRole = 'MEMBER' | 'MODERATOR' | 'STAFF';
export type CommunityBadge = 'VERIFIED_TRAINER' | 'DISTRIBUTOR' | null;

export interface AdminCommunityMember {
  id: string;
  displayName: string;
  email: string;
  bio: string | null;
  status: CommunityMemberStatus;
  role: CommunityMemberRole;
  badge: CommunityBadge;
  postCount: number;
  replyCount: number;
  bookmarkCount: number;
  createdAt: string;
}

export interface AdminCommunityMembersPage {
  items: AdminCommunityMember[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface AdminCommunityMemberDetail extends AdminCommunityMember {
  accountName: string | null;
  languages: string[];
  dialects: string[];
  country: { name: string; code: string } | null;
  spaces: { id: string; name: string; slug: string }[];
  moderationHistory: {
    id: string;
    action: string;
    reason: string | null;
    createdAt: string;
    moderator: { firstName: string | null; lastName: string | null; email: string };
  }[];
}

export interface CommunitySettingsAdmin {
  postingEnabled: boolean;
  repliesEnabled: boolean;
  attachmentsEnabled: boolean;
  reactionsEnabled: boolean;
  newMemberPostingDelayMinutes: number;
  requireApprovalForNewMembers: boolean;
  adsterraEnabled: boolean;
  adsterraScriptUrl: string | null;
  monetagEnabled: boolean;
  monetagScriptUrl: string | null;
}

export interface AdminCommunityContentPage<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
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
  minCompletedTasksForWithdrawal: number;
  completedTasksForWithdrawal: number;
  minWalletBalanceTokens: string;
  withdrawableBalanceTokens: string;
  localCurrency: LocalCurrency | null;
  balanceInLocalCurrency: string | null;
  fundedTokens: string;
  trainingEarningsTokens: string;
  referralEarningsTokens: string;
  totalTokensSinceJoin: string;
  otherCreditsTokens: string;
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
    recentInvites: {
      id: string;
      firstName: string | null;
      email: string;
      createdAt: string;
      status: 'INVITED' | 'JOINED';
    }[];
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
  domainConversationTaskEnabled: boolean;
  dialectValidationTaskEnabled: boolean;
  /** Master gate for contributor licensing; false hides every VDCL surface. */
  vdclEnabled: boolean;
  sessionIdleTimeoutMinutes: number;
  sessionMaxHours: number;
  phoneVerificationRequired: boolean;
  manualPhoneVerificationEnabled: boolean;
  manualPhoneVerificationFeeTokens: string;
  manualPhoneVerificationWhatsappNumber: string;
  manualPhoneVerificationExpiryMinutes: number;
  // enabled = login OR signup is blocked; the two flags below let each page
  // (login vs register) show the notice only when it actually applies to it.
  authMaintenanceEnabled: boolean;
  authMaintenanceBlocksLogin: boolean;
  authMaintenanceBlocksSignup: boolean;
  authMaintenanceUntil: string | null;
  authMaintenanceMessage: string | null;
  tawkToEnabled: boolean;
  tawkToPropertyId: string | null;
  tawkToWidgetId: string | null;
  googleAnalyticsEnabled: boolean;
  googleAnalyticsMeasurementId: string | null;
  supportChatMode: 'NONE' | 'TAWK' | 'AI';
  trainerAdsterra728: { scriptUrl: string; key: string } | null;
  pwaInstallPromptEnabled: boolean;
  pwaInstallPromptReminderMinutes: number;
  isKycRequiredForWithdrawals: boolean;
  kycMinWithdrawalTokens: string;
  isKycRequiredOnboarding: boolean;
  activeKycProvider: string;
  isFlutterwaveV4Enabled: boolean;
  isFlutterwavePayoutsEnabled: boolean;
  isStripePayoutsEnabled: boolean;
  isPlatformPayoutEnabled: boolean;
  isCryptoWithdrawalsEnabled: boolean;
  /** Global master switch checked ahead of the four per-rail flags above -- false means every payout rail is blocked, regardless of the others. */
  withdrawalsEnabled: boolean;
  withdrawalsDisabledMessage: string | null;
  allowedWithdrawalCurrencies: string;
  allowedWithdrawalNetworks: string;
  testimonyEnabled: boolean;
  testimonyMaxTextLength: number;
  testimonyMaxVideoSeconds: number;
  testimonyLandingLimit: number;
  testimonyBubblesEnabled: boolean;
  testimonyBubbleIntervalSeconds: number;
  testimonyApprovalWeeklyLimit: number;
  testimonyApprovalMonthlyLimit: number;
  testimonyTextRewardTokens: string;
  testimonyVideoRewardTokens: string;
  topBannerEnabled: boolean;
  topBannerImageUrl: string | null;
  topBannerAltText: string | null;
  topBannerLearnMoreUrl: string | null;
  connectHero: ConnectHeroSettings;
}

/**
 * The DL Connect event hero shown full-bleed under the dashboard and
 * community nav. The API resolves every fallback (title from the event
 * year, CTA label, URL), so the client just renders what it is given --
 * and renders nothing at all when `enabled` is false.
 */
export interface ConnectHeroSettings {
  enabled: boolean;
  eventYear: string;
  title: string;
  subtitle: string | null;
  dateLabel: string | null;
  ctaLabel: string;
  url: string;
  imageUrl: string | null;
}

export type TestimonyKind = 'VIDEO' | 'TEXT';
export type TestimonyStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface Testimony {
  id: string;
  userId: string;
  kind: TestimonyKind;
  text: string | null;
  videoBucket: string | null;
  videoKey: string | null;
  durationMs: number | null;
  status: TestimonyStatus;
  reviewedAt: string | null;
  reviewedByAdminId: string | null;
  adminEditedAt: string | null;
  editedByAdminId: string | null;
  rejectionReason: string | null;
  rewardCredited: boolean;
  visible: boolean;
  createdAt: string;
}

export interface TestimonyUpload {
  uploadUrl: string;
  key: string;
  bucket: string;
  expiresInSeconds: number;
}

export type SubmitTestimonyInput =
  | { kind: 'TEXT'; text: string }
  | { kind: 'VIDEO'; bucket: string; videoKey: string; durationMs: number };

export interface TestimonyAdminPage {
  items: (Testimony & {
    videoUrl: string | null;
    userApprovedCount: number;
    userLastApprovedAt: string | null;
    user: { firstName: string | null; lastName: string | null; email: string };
  })[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  analytics: {
    totalApproved: number;
    approvedThisWeek: number;
    approvedThisMonth: number;
    lastApprovalAt: string | null;
    lastApprovalTrainer: string | null;
  };
}

export type MarketingAdFormat = 'FEED_SQUARE' | 'STORY' | 'LINK_PREVIEW';

export interface MarketingAdPhoto {
  id: string;
  format: MarketingAdFormat;
  url: string;
}

export interface MarketingHeadline {
  id: string;
  format: MarketingAdFormat;
  title: string;
  description: string;
}

export interface MarketingMaterials {
  photos: MarketingAdPhoto[];
  headlines: MarketingHeadline[];
}

export interface MarketingCampaignShare {
  id: string;
  userId: string;
  photoId: string;
  headlineId: string;
  viewCount: number;
  createdAt: string;
}

export interface MyMarketingShare {
  id: string;
  format: MarketingAdFormat;
  photoUrl: string;
  headlineTitle: string;
  viewCount: number;
  registeredCount: number;
  createdAt: string;
}

export interface AdminMarketingAdPhoto {
  id: string;
  format: MarketingAdFormat;
  bucket: string;
  key: string;
  url: string;
  active: boolean;
  sortOrder: number;
  createdAt: string;
}

export interface AdminMarketingHeadline {
  id: string;
  format: MarketingAdFormat;
  title: string;
  description: string;
  active: boolean;
  sortOrder: number;
  createdAt: string;
}

export type EarningsChartRange = 'today' | 'week' | 'month' | 'year';

export type ManualPhoneVerificationStatus = 'PENDING' | 'VERIFIED' | 'REJECTED' | 'EXPIRED';

export interface ManualPhoneVerificationRequestResult {
  requestId: string;
  code: string;
  whatsappNumber: string;
  feeTokenAmount: string;
  expiresAt: string;
}

export interface ManualPhoneVerificationRow {
  id: string;
  phoneNumber: string;
  status: ManualPhoneVerificationStatus;
  feeTokenAmount: string;
  sentAt: string | null;
  verifiedAt: string | null;
  rejectedAt: string | null;
  expiresAt: string;
  createdAt: string;
  user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    phoneNumber: string | null;
    phoneVerified: boolean;
  };
  verifiedByAdmin: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  } | null;
  verifiedWithoutCode: boolean;
}

export interface ManualPhoneVerificationPage {
  items: ManualPhoneVerificationRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface AdminWhatsAppValidationRow {
  id: string;
  phoneNumber: string;
  status: WhatsAppValidationRequestStatus;
  feeTokenAmount: string;
  attempts: number;
  maxAttempts: number;
  claimedAt: string | null;
  verifiedAt: string | null;
  rejectedAt: string | null;
  expiresAt: string;
  createdAt: string;
  requester: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  };
  claimedByValidator: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  } | null;
}

export interface AdminWhatsAppValidationPage {
  items: AdminWhatsAppValidationRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface EarningsChart {
  range: EarningsChartRange;
  buckets: { label: string; amount: string }[];
}

export interface TrainerReport {
  from: string;
  to: string;
  totals: {
    recordings: number;
    scoredRecordings: number;
    avgScore: string | null;
    avgCompositeScore: string | null;
    trainingEarningsTokens: string;
    referralEarningsTokens: string;
    totalEarningsTokens: string;
    totalTokensSinceJoin: string;
    otherCreditsTokens: string;
    availableBalanceTokens: string;
    heldBalanceTokens: string;
    totalWithdrawnTokens: string;
  };
  daily: { date: string; recordings: number; earningsTokens: string }[];
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
  trainersSignedUpLastHour: number;
  trainerSignupRatePerHour: string;
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
  sentencesCount: number;
  trainingSessionsCount: number;
  wordRecordingsCount: number;
  wordRecordingsPending: number;
  wordRecordingsScored: number;
  wordRecordingsSettled: number;
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
  totalAdminFundingTokens: string;
  totalAdminAdjustmentTokens: string;
  blogPostsCount: number;
  publishedBlogPostsCount: number;
  draftBlogPostsCount: number;
}

export interface AdminLeaderboardUser {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  role: 'TRAINER' | 'ADMIN' | 'PARTNER' | 'DISTRIBUTOR' | 'VALIDATOR';
  phoneNumber: string | null;
  phoneVerified: boolean;
  kycStatus: KycStatus;
}

export interface LeaderboardEarnerRow {
  user: AdminLeaderboardUser;
  totalEarned: string;
  payoutCount: number;
}

export interface LeaderboardContributorRow {
  user: AdminLeaderboardUser;
  totalTasks: number;
  wordRecordings: number;
  submissions: number;
}

export interface AdminLeaderboard {
  topEarners: LeaderboardEarnerRow[];
  topContributors: LeaderboardContributorRow[];
}

export interface LeaderboardPage<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ProofReportLedgerEntry {
  id: string;
  type: string;
  amount: string;
  reference: string | null;
  createdAt: string;
}

export interface ProofAccountReport {
  userId: string;
  generatedAt: string;
  accountCreatedAt: string;
  summary: {
    totalTokensSinceJoin: string;
    availableBalanceTokens: string;
    heldBalanceTokens: string;
    totalWithdrawnTokens: string;
    totalRecordings: number;
    scoredRecordings: number;
    avgScore: string | null;
  };
  ledgerTotalsByType: { type: string; totalAmount: string; count: number }[];
  ledgerEntries: ProofReportLedgerEntry[];
}

export interface ProofAccountReportResponse {
  user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  };
  report: ProofAccountReport;
}

export interface MyProofAccountReportResponse {
  sharedAt: string;
  report: ProofAccountReport;
}

export interface ApiAccessTokenSummary {
  key: string;
  isSet: boolean;
  lastFour: string | null;
  updatedAt: string | null;
  updatedByEmail: string | null;
}

export type IsvcConfidence = 'EMERGING' | 'ESTABLISHED' | 'HIGH' | 'VERY_HIGH';

export interface SubscriptionPlan {
  id: string;
  key: string;
  name: string;
  stripePriceId: string | null;
  monthlyUsdAmount: string;
  maxStreamDecks: number | null;
  maxTeamMembers: number | null;
  minIsvcConfidence: IsvcConfidence | null;
  /** Bytes, as a string (server-serialized from a Prisma BigInt). */
  monthlyByteQuota: string | null;
  monthlyRequestQuota: number | null;
  /** Admin-authored comparison bullets, display-only. */
  features: string[];
  active: boolean;
}

export interface PublicSubscriptionPlan {
  key: string;
  name: string;
  monthlyUsdAmount: string;
  maxStreamDecks: number | null;
  maxTeamMembers: number | null;
  minIsvcConfidence: IsvcConfidence | null;
  monthlyByteQuota: string | null;
  monthlyRequestQuota: number | null;
  features: string[];
}

export interface SubscriptionPlanInput {
  key: string;
  name: string;
  stripePriceId?: string | null;
  monthlyUsdAmount: number;
  maxStreamDecks?: number | null;
  maxTeamMembers?: number | null;
  minIsvcConfidence?: IsvcConfidence | null;
  /** Bytes, as a JS number -- the server converts to BigInt. */
  monthlyByteQuota?: number | null;
  monthlyRequestQuota?: number | null;
  features?: string[];
  active?: boolean;
}

export interface PlatformSettings {
  tokenUsdRate: string | null;
  minWithdrawalTokens: string | null;
  minWalletBalanceTokens: string;
  minCompletedTasksForWithdrawal: number | null;
  resendFromAddress: string | null;
  leadsNotificationAddress: string | null;
  referralCookiePersistSeconds: number;
  referralInviteExpirySeconds: number;
  wordTrainingRecordingTimeoutSeconds: number;
  wordTrainingRecordingMaxTimeoutSeconds: number;
  trainingPayoutBonusCapMultiple: string | null;
  taskTokenCost: string | null;
  reverseWordTrainingEnabled: boolean;
  wordTrainingEnabled: boolean;
  sentenceTrainingEnabled: boolean;
  domainConversationTaskEnabled: boolean;
  dialectValidationTaskEnabled: boolean;
  dialectValidationPayoutTokens: string | null;
  misplacedDialectFlagThreshold: number;
  noAudioClawbackFlagThreshold: number;
  dialectValidationMinSeconds: number;
  domainConversationMinDurationSeconds: number;
  domainConversationMaxDurationSeconds: number;
  domainConversationTaskTokenCost: string | null;
  domainConversationGenerationEnabled: boolean;
  domainConversationPromptsPerRun: number;
  domainConversationMaxPromptPoolSize: number;
  domainConversationProviderOrder: string;
  domainConversationQualityWeightNoise: string;
  domainConversationQualityWeightQuality: string;
  domainConversationQualityWeightLiveness: string;
  domainConversationMinQualityScoreForPayout: string;
  domainConversationMaxCyclesPerTrainer: number;
  adminPayoutOtpEnabled: boolean;
  sessionIdleTimeoutMinutes: number;
  sessionMaxHours: number;
  phoneVerificationRequired: boolean;
  manualPhoneVerificationEnabled: boolean;
  manualPhoneVerificationFeeTokens: string;
  manualPhoneVerificationWhatsappNumber: string;
  manualPhoneVerificationExpiryMinutes: number;
  startupBonusAmount: string | null;
  tawkToEnabled: boolean;
  tawkToPropertyId: string | null;
  tawkToWidgetId: string | null;
  googleAnalyticsEnabled: boolean;
  googleAnalyticsMeasurementId: string | null;
  supportChatMode: 'NONE' | 'TAWK' | 'AI';
  trainerAdsterra728Enabled: boolean;
  trainerAdsterra728ScriptUrl: string | null;
  trainerAdsterra728Key: string | null;
  pwaInstallPromptEnabled: boolean;
  pwaInstallPromptReminderMinutes: number;
  weeklyTrainerReportEnabled: boolean;
  wordStuckTimeoutMinutes: number;
  scoringSlaMinutes: number;
  auditHoldEveryNSubmissions: number;
  settlementDelayMinutes: number;
  noFailOnTrainEnabled: boolean;
  minScoreRange: string;
  maxScoreRange: string;
  llmGenerationEnabled: boolean;
  wordGenerationEnabled: boolean;
  sentenceGenerationEnabled: boolean;
  sentenceWordCount: number;
  singleWordGenerationEnabled: boolean;
  llmProviderOrder: string;
  llmWordsPerItem: number;
  llmItemsPerRun: number;
  llmMaxTotalGeneratedItems: number;
  llmMaxSentenceGeneratedItems: number;
  llmMaxPoolPerDialect: number;
  llmBackfillItemsPerDialectPerRun: number;
  keyboardLayoutMaxLength: number;
  submissionRateLimitEnabled: boolean;
  submissionRateLimitPerHour: number;
  submissionDailyLimitEnabled: boolean;
  submissionDailyLimitPerDay: number;
  qracEnabled: boolean;
  qracRequiredAtSessionStart: boolean;
  qracIntervalMinutes: number;
  testimonyEnabled: boolean;
  testimonyMaxTextLength: number;
  testimonyMaxVideoSeconds: number;
  testimonyLandingLimit: number;
  testimonyBubblesEnabled: boolean;
  testimonyBubbleIntervalSeconds: number;
  testimonyApprovalWeeklyLimit: number;
  testimonyApprovalMonthlyLimit: number;
  testimonyTextRewardTokens: string;
  testimonyVideoRewardTokens: string;
  vdclEnabled: boolean;
  vdclEnforcementEnabled: boolean;
  vdclRetentionExemptionEnabled: boolean;
  qualityGateEnabled: boolean;
  qualityWeightConsensus: string;
  qualityWeightNoise: string;
  qualityWeightQuality: string;
  qualityWeightLiveness: string;
  qualityWeightAsrMatch: string;
  spellingNormalizationEnabled: boolean;
  speechExpressionEnabled: boolean;
  spellingNormalizationProviderOrder: string;
  phraseEscalationEnabled: boolean;
  phraseTierGenerationEnabled: boolean;
  phraseTierItemsPerTierPerRun: number;
  smsSenderId: string | null;
  smsProviderOrder: string;
  smslive247NativeOtpEnabled: boolean;
  smsTransactionalOtpEnabled: boolean;
  smsTransactionalProviderOrder: string;
  p2pSmsTradeCreatedEnabled: boolean;
  p2pSmsPaymentMarkedEnabled: boolean;
  p2pSmsTokensReleasedEnabled: boolean;
  p2pSmsCancelledEnabled: boolean;
  walletSmsWithdrawalPaidEnabled: boolean;
  walletSmsWithdrawalRejectedEnabled: boolean;
  walletSmsWithdrawalFailedEnabled: boolean;
  walletSmsDepositConfirmedEnabled: boolean;
  referralSmsFundingBonusEnabled: boolean;
  referralSmsPayoutBonusEnabled: boolean;
  otpChannel: string;
  whatsappOtpEnabled: boolean;
  whatsappSenderId: string | null;
  whatsappTemplateId: string | null;
  /** Whether an API key is currently saved -- the key itself is never returned to the client, see PlatformSettingsService.getForAdmin. */
  whatsappApiKeySet: boolean;
  whatsappProvider: string;
  whatsappMetaPhoneNumberId: string | null;
  whatsappMetaBusinessAccountId: string | null;
  whatsappMetaTemplateName: string | null;
  whatsappMetaTemplateLanguage: string;
  /** Whether a Meta access token is currently saved -- the token itself is never returned to the client. */
  whatsappMetaAccessTokenSet: boolean;
  withdrawalsEnabled: boolean;
  withdrawalsDisabledMessage: string | null;
  cryptoWithdrawalsEnabled: boolean;
  nowPaymentsPayoutsEnabled: boolean;
  allowedWithdrawalCurrencies: string;
  allowedWithdrawalNetworks: string;
  isFlutterwaveFundingEnabled: boolean;
  isFlutterwavePayoutsEnabled: boolean;
  isFlutterwaveV4Enabled: boolean;
  allowedFlutterwaveCurrencies: string;
  allowedFlutterwaveCountries: string;
  isStripePayoutsEnabled: boolean;
  isPlatformPayoutEnabled: boolean;
  withdrawalFeeMode: string;
  withdrawalFeeTokenAmount: string;
  withdrawalFeePercent: string;
  autoSubmitAfterApproval: boolean;
  isKycRequiredForWithdrawals: boolean;
  kycMinWithdrawalTokens: string;
  isKycRequiredOnboarding: boolean;
  kycAutoCancelStaleEnabled: boolean;
  kycAutoCancelStaleMinutes: number;
  selfHostedKycEnabled: boolean;
  activeKycProvider: string;
  selfHostedKycAutoApproveEnabled: boolean;
  selfHostedKycBotEnabled: boolean;
  selfHostedKycBotProviderOrder: string;
  selfHostedKycDocumentTypes: string;
  selfHostedKycMinFaceMatchScore: number;
  selfHostedKycMinLivenessScore: number;
  selfHostedKycMaxFaceMatchScoreForDecline: number;
  selfHostedKycMaxLivenessScoreForDecline: number;
  selfHostedKycRequireDocumentFaceDetected: boolean;
  selfHostedKycDoNotAutoDeclineEnabled: boolean;
  authMaintenanceEnabled: boolean;
  authMaintenanceUntil: string | null;
  authMaintenanceMessage: string | null;
  authMaintenanceBlockLogin: boolean;
  authMaintenanceBlockSignup: boolean;
  authMaintenanceBlockSessions: boolean;
  authMaintenanceExcludeAdmin: boolean;
  authMaintenanceExcludePartner: boolean;
  registerRateLimitPerHour: number;
  landingShowCountries: boolean;
  landingShowDialects: boolean;
  landingShowTrainers: boolean;
  landingShowPoolVolume: boolean;
  landingShowPayout: boolean;
  streamSelfServeSignupEnabled: boolean;
  topBannerEnabled: boolean;
  topBannerImageUrl: string | null;
  topBannerAltText: string | null;
  topBannerLearnMoreUrl: string | null;
  connectHeroEnabled: boolean;
  connectEventYear: string;
  connectHeroTitle: string | null;
  connectHeroSubtitle: string | null;
  connectHeroDateLabel: string | null;
  connectHeroCtaLabel: string | null;
  connectHeroUrl: string | null;
  connectHeroImageUrl: string | null;
  updatedAt: string;
  createdAt: string;
}

export interface PlatformSettingsInput {
  tokenUsdRate?: number | null;
  minWithdrawalTokens?: number | null;
  minWalletBalanceTokens?: number;
  minCompletedTasksForWithdrawal?: number | null;
  resendFromAddress?: string | null;
  leadsNotificationAddress?: string | null;
  referralCookiePersistSeconds?: number;
  referralInviteExpirySeconds?: number;
  wordTrainingRecordingTimeoutSeconds?: number;
  wordTrainingRecordingMaxTimeoutSeconds?: number;
  trainingPayoutBonusCapMultiple?: number | null;
  taskTokenCost?: number | null;
  reverseWordTrainingEnabled?: boolean;
  wordTrainingEnabled?: boolean;
  sentenceTrainingEnabled?: boolean;
  domainConversationTaskEnabled?: boolean;
  dialectValidationTaskEnabled?: boolean;
  dialectValidationPayoutTokens?: number | null;
  misplacedDialectFlagThreshold?: number;
  noAudioClawbackFlagThreshold?: number;
  dialectValidationMinSeconds?: number;
  domainConversationMinDurationSeconds?: number;
  domainConversationMaxDurationSeconds?: number;
  domainConversationTaskTokenCost?: number;
  domainConversationGenerationEnabled?: boolean;
  domainConversationPromptsPerRun?: number;
  domainConversationMaxPromptPoolSize?: number;
  domainConversationProviderOrder?: string;
  domainConversationQualityWeightNoise?: number;
  domainConversationQualityWeightQuality?: number;
  domainConversationQualityWeightLiveness?: number;
  domainConversationMinQualityScoreForPayout?: number;
  domainConversationMaxCyclesPerTrainer?: number;
  adminPayoutOtpEnabled?: boolean;
  sessionIdleTimeoutMinutes?: number;
  sessionMaxHours?: number;
  phoneVerificationRequired?: boolean;
  manualPhoneVerificationEnabled?: boolean;
  manualPhoneVerificationFeeTokens?: number;
  manualPhoneVerificationWhatsappNumber?: string;
  manualPhoneVerificationExpiryMinutes?: number;
  startupBonusAmount?: number | null;
  tawkToEnabled?: boolean;
  tawkToPropertyId?: string;
  tawkToWidgetId?: string;
  googleAnalyticsEnabled?: boolean;
  googleAnalyticsMeasurementId?: string | null;
  supportChatMode?: 'NONE' | 'TAWK' | 'AI';
  trainerAdsterra728Enabled?: boolean;
  trainerAdsterra728ScriptUrl?: string | null;
  trainerAdsterra728Key?: string | null;
  pwaInstallPromptEnabled?: boolean;
  pwaInstallPromptReminderMinutes?: number;
  weeklyTrainerReportEnabled?: boolean;
  wordStuckTimeoutMinutes?: number;
  scoringSlaMinutes?: number;
  auditHoldEveryNSubmissions?: number;
  settlementDelayMinutes?: number;
  noFailOnTrainEnabled?: boolean;
  minScoreRange?: number;
  maxScoreRange?: number;
  llmGenerationEnabled?: boolean;
  wordGenerationEnabled?: boolean;
  sentenceGenerationEnabled?: boolean;
  sentenceWordCount?: number;
  singleWordGenerationEnabled?: boolean;
  llmProviderOrder?: string;
  llmWordsPerItem?: number;
  llmItemsPerRun?: number;
  llmMaxTotalGeneratedItems?: number;
  llmMaxSentenceGeneratedItems?: number;
  llmMaxPoolPerDialect?: number;
  llmBackfillItemsPerDialectPerRun?: number;
  keyboardLayoutMaxLength?: number;
  submissionRateLimitEnabled?: boolean;
  submissionRateLimitPerHour?: number;
  submissionDailyLimitEnabled?: boolean;
  submissionDailyLimitPerDay?: number;
  qracEnabled?: boolean;
  qracRequiredAtSessionStart?: boolean;
  qracIntervalMinutes?: number;
  testimonyEnabled?: boolean;
  testimonyMaxTextLength?: number;
  testimonyMaxVideoSeconds?: number;
  testimonyLandingLimit?: number;
  testimonyBubblesEnabled?: boolean;
  testimonyBubbleIntervalSeconds?: number;
  testimonyApprovalWeeklyLimit?: number;
  testimonyApprovalMonthlyLimit?: number;
  testimonyTextRewardTokens?: number;
  testimonyVideoRewardTokens?: number;
  vdclEnabled?: boolean;
  vdclEnforcementEnabled?: boolean;
  vdclRetentionExemptionEnabled?: boolean;
  qualityGateEnabled?: boolean;
  qualityWeightConsensus?: number;
  qualityWeightNoise?: number;
  qualityWeightQuality?: number;
  qualityWeightLiveness?: number;
  qualityWeightAsrMatch?: number;
  spellingNormalizationEnabled?: boolean;
  speechExpressionEnabled?: boolean;
  spellingNormalizationProviderOrder?: string;
  phraseEscalationEnabled?: boolean;
  phraseTierGenerationEnabled?: boolean;
  phraseTierItemsPerTierPerRun?: number;
  smsSenderId?: string;
  smsProviderOrder?: string;
  smslive247NativeOtpEnabled?: boolean;
  smsTransactionalOtpEnabled?: boolean;
  smsTransactionalProviderOrder?: string;
  p2pSmsTradeCreatedEnabled?: boolean;
  p2pSmsPaymentMarkedEnabled?: boolean;
  p2pSmsTokensReleasedEnabled?: boolean;
  p2pSmsCancelledEnabled?: boolean;
  walletSmsWithdrawalPaidEnabled?: boolean;
  walletSmsWithdrawalRejectedEnabled?: boolean;
  walletSmsWithdrawalFailedEnabled?: boolean;
  walletSmsDepositConfirmedEnabled?: boolean;
  referralSmsFundingBonusEnabled?: boolean;
  referralSmsPayoutBonusEnabled?: boolean;
  otpChannel?: string;
  whatsappOtpEnabled?: boolean;
  whatsappSenderId?: string;
  whatsappTemplateId?: string;
  /** Plaintext -- encrypted server-side before persisting, never echoed back. Omit to leave unchanged; pass '' to clear. */
  whatsappApiKey?: string;
  whatsappProvider?: string;
  whatsappMetaPhoneNumberId?: string;
  whatsappMetaBusinessAccountId?: string;
  whatsappMetaTemplateName?: string;
  whatsappMetaTemplateLanguage?: string;
  /** Plaintext -- encrypted server-side before persisting, never echoed back. Omit to leave unchanged; pass '' to clear. */
  whatsappMetaAccessToken?: string;
  withdrawalsEnabled?: boolean;
  withdrawalsDisabledMessage?: string | null;
  cryptoWithdrawalsEnabled?: boolean;
  nowPaymentsPayoutsEnabled?: boolean;
  allowedWithdrawalCurrencies?: string;
  allowedWithdrawalNetworks?: string;
  isFlutterwaveFundingEnabled?: boolean;
  isFlutterwavePayoutsEnabled?: boolean;
  isFlutterwaveV4Enabled?: boolean;
  allowedFlutterwaveCurrencies?: string;
  allowedFlutterwaveCountries?: string;
  isStripePayoutsEnabled?: boolean;
  isPlatformPayoutEnabled?: boolean;
  withdrawalFeeMode?: string;
  withdrawalFeeTokenAmount?: number;
  withdrawalFeePercent?: number;
  autoSubmitAfterApproval?: boolean;
  isKycRequiredForWithdrawals?: boolean;
  kycMinWithdrawalTokens?: number;
  isKycRequiredOnboarding?: boolean;
  kycAutoCancelStaleEnabled?: boolean;
  kycAutoCancelStaleMinutes?: number;
  selfHostedKycEnabled?: boolean;
  activeKycProvider?: string;
  selfHostedKycAutoApproveEnabled?: boolean;
  selfHostedKycBotEnabled?: boolean;
  selfHostedKycBotProviderOrder?: string;
  selfHostedKycDocumentTypes?: string;
  selfHostedKycMinFaceMatchScore?: number;
  selfHostedKycMinLivenessScore?: number;
  selfHostedKycMaxFaceMatchScoreForDecline?: number;
  selfHostedKycMaxLivenessScoreForDecline?: number;
  selfHostedKycRequireDocumentFaceDetected?: boolean;
  selfHostedKycDoNotAutoDeclineEnabled?: boolean;
  authMaintenanceEnabled?: boolean;
  authMaintenanceUntil?: string | null;
  authMaintenanceMessage?: string | null;
  authMaintenanceBlockLogin?: boolean;
  authMaintenanceBlockSignup?: boolean;
  authMaintenanceBlockSessions?: boolean;
  authMaintenanceExcludeAdmin?: boolean;
  authMaintenanceExcludePartner?: boolean;
  registerRateLimitPerHour?: number;
  landingShowCountries?: boolean;
  landingShowDialects?: boolean;
  landingShowTrainers?: boolean;
  landingShowPoolVolume?: boolean;
  landingShowPayout?: boolean;
  streamSelfServeSignupEnabled?: boolean;
  topBannerEnabled?: boolean;
  topBannerImageBucket?: string | null;
  topBannerImageKey?: string | null;
  topBannerAltText?: string | null;
  topBannerLearnMoreUrl?: string | null;
  connectHeroEnabled?: boolean;
  connectEventYear?: string;
  connectHeroTitle?: string | null;
  connectHeroSubtitle?: string | null;
  connectHeroDateLabel?: string | null;
  connectHeroCtaLabel?: string | null;
  connectHeroUrl?: string | null;
  connectHeroImageBucket?: string | null;
  connectHeroImageKey?: string | null;
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
  wordId: string | null;
  direction: WordTrainingDirection;
  promptText: string | null;
  sourceAudioUrl?: string | null;
  sourceLanguage: string;
  responseLanguage: string;
  dialectTag: string | null;
  dialectKeyboardLayout: string | null;
  phraseTierJustReached: boolean;
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
  analytics: {
    totalApproved: number;
    approvedThisWeek: number;
    approvedThisMonth: number;
    lastApprovalAt: string | null;
    lastApprovalTrainer: string | null;
  };
}

export interface DomainConversationPrompt {
  assignmentId: string;
  promptId: string;
  domain: string;
  promptText: string;
  dialectTag: string;
  dialectName: string;
  minDurationSeconds: number;
  maxDurationSeconds: number;
}

export interface DomainConversationRecordingUpload {
  uploadUrl: string;
  key: string;
  bucket: string;
  expiresInSeconds: number;
}

export type WordValidationFlag =
  | 'WRONG_DIALECT'
  | 'NO_AUDIO'
  | 'UNCLEAR_NOISY'
  | 'MULTIPLE_SPEAKERS'
  | 'NO_WORD_MATCH'
  | 'TOO_FAST'
  | 'TOO_SLOW';

export interface WordValidationItem {
  recordingId: string;
  audioUrl: string | null;
  wordOptions: { id: string; text: string }[];
  dialectTag: string;
  dialectName: string;
  // Echo this back verbatim in submitWordValidation -- the server uses it to
  // prove (via its own clock) how long ago this item was actually served.
  presentmentToken: string;
}

export interface MisplacedDialectRecording {
  id: string;
  dialectTag: string;
  wrongDialectFlagCount: number;
  misplacedDialectAt: string;
  audioUrl: string | null;
  word: { text: string } | null;
  createdAt: string;
}

export interface MisplacedDialectRecordingsPage {
  items: MisplacedDialectRecording[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface DomainConversationSubmissionSummary {
  id: string;
  prompt: { domain: string; text: string };
  dialectTag: string;
  status: 'PENDING' | 'REJECTED' | 'SCORED' | 'SETTLED' | 'EXPIRED';
  tokensSpent: string;
  noiseScore: string | null;
  qualityScore: string | null;
  livenessScore: string | null;
  compositeScore: string | null;
  payoutTokenAmount: string | null;
  rejectionReason: string | null;
  createdAt: string;
  scoredAt: string | null;
  settledAt: string | null;
}

export interface DomainConversationSubmissionsPage {
  items: DomainConversationSubmissionSummary[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export type DomainPromptGenderVariant = 'NEUTRAL' | 'MALE' | 'FEMALE';

export interface AdminDomainPrompt {
  id: string;
  scenarioKey: string;
  domain: string;
  genderVariant: DomainPromptGenderVariant;
  text: string;
  isDisabled: boolean;
  lastServedAt: string | null;
  timesServed: number;
  source: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdminDomainPromptsPage {
  items: AdminDomainPrompt[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export type AdminAuditStatus = 'VALID' | 'INVALID';
export type RecordingKind = 'word';

export interface AdminRecordingTrainer {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

export interface WordDetail {
  word: string;
  start: number;
  end: number;
  conf: number | null;
}

export type SpeechEmotion =
  'NEUTRAL' | 'HAPPY' | 'SAD' | 'ANGRY' | 'FEARFUL' | 'SURPRISED' | 'DISGUSTED';
export type SpeechTone = 'FORMAL' | 'CASUAL' | 'EMPHATIC' | 'FLAT';
export type SpeechStyle = 'CONVERSATIONAL' | 'READ_ALOUD' | 'EXPRESSIVE';
export type SpeechSpeed = 'SLOW' | 'NORMAL' | 'FAST';
export type SpeechEnergy = 'LOW' | 'MEDIUM' | 'HIGH';

export interface ProsodyMetrics {
  speechRateEstimate: number | null;
  meanPitchHz: number | null;
  pitchStdHz: number | null;
  meanRmsDb: number | null;
  rmsStdDb: number | null;
  pauseRatio: number | null;
}

export interface AdminRecordingSummary {
  id: string;
  kind: RecordingKind;
  trainer?: AdminRecordingTrainer | null;
  direction: 'ENGLISH_TO_DIALECT' | 'DIALECT_TO_ENGLISH' | null;
  promptText: string;
  responseText: string | null;
  asrTranscript: string | null;
  dialectTag: string;
  status: 'PENDING' | 'TRANSCRIBED' | 'REJECTED' | 'SCORED' | 'SETTLED' | 'EXPIRED';
  tokensSpent: string;
  rawScore: string | null;
  score: string | null;
  noiseScore: string | null;
  qualityScore: string | null;
  livenessScore: string | null;
  emotion: SpeechEmotion | null;
  emotionConfidence: string | null;
  tone: SpeechTone | null;
  style: SpeechStyle | null;
  speed: SpeechSpeed | null;
  energy: SpeechEnergy | null;
  prosodyMetrics: ProsodyMetrics | null;
  expressionCheckedAt: string | null;
  compositeScore: string | null;
  payoutTokenAmount: string | null;
  audioUrl: string | null;
  asrWordDetail: WordDetail[] | null;
  rejectionReason: string | null;
  adminAuditStatus: AdminAuditStatus | null;
  adminAuditedAt: string | null;
  createdAt: string;
  scoredAt: string | null;
  settledAt: string | null;
}

/**
 * One dialect's ASR status. `mapped` is whether models/asr-registry.yaml
 * routes it anywhere; `coveragePercent` is what actually got transcribed.
 * The two can disagree -- a mapped dialect whose checkpoint fails to load
 * reads as mapped but transcribes nothing.
 */
export type ConnectSpeakerStatus = 'PENDING' | 'APPROVED' | 'DECLINED';

export interface ConnectRegistrationRow {
  id: string;
  name: string;
  email: string;
  countryCode: string;
  speaking: boolean;
  speakerTopic: string | null;
  speakerSummary: string | null;
  speakerStatus: ConnectSpeakerStatus;
  speakerDecidedAt: string | null;
  photoUrl: string | null;
  photoTokenExpiresAt: string | null;
  createdAt: string;
  userId: string | null;
  user: {
    id: string;
    email: string;
    phoneNumber: string | null;
    phoneVerifiedAt: string | null;
  } | null;
  speakerDecidedBy: { email: string; firstName: string | null; lastName: string | null } | null;
}

export interface ConnectAdminOverview {
  stats: {
    interested: number;
    countries: number;
    speakerApplicants: number;
    speakersPending: number;
    speakersApproved: number;
    speakersDeclined: number;
    /** Registrations reachable by SMS: a linked member with a verified number. */
    smsReachable: number;
    withPhoto: number;
  };
  speakers: ConnectRegistrationRow[];
  attendees: ConnectRegistrationRow[];
}

export interface ConnectReminderResult {
  audience: 'all' | 'speakers';
  total: number;
  sent: number;
  /** Texts delivered alongside the emails, to verified-phone members only. */
  smsSent: number;
  failed: string[];
}

export interface AsrCoverageRow {
  dialectTag: string;
  name: string | null;
  recordings: number;
  transcribed: number;
  coveragePercent: number;
  mapped: boolean;
  engine: string | null;
  checkpoint: string | null;
  /**
   * Untranscribed recordings whose audio still exists, i.e. what a
   * backfill could actually recover. Not the same as
   * recordings - transcribed, which also counts rows whose audio the
   * retention job has already purged and which can never be transcribed.
   */
  backfillable: number;
  backfillEnabled: boolean;
  /** Non-null means backfill is unavailable for this dialect, and why. */
  backfillBlocked: string | null;
}

export interface AdminRecordingsPage {
  items: AdminRecordingSummary[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ValidatorRecordingSummary {
  id: string;
  direction: 'ENGLISH_TO_DIALECT' | 'DIALECT_TO_ENGLISH' | null;
  promptText: string;
  responseText: string | null;
  asrTranscript: string | null;
  dialectTag: string;
  status: 'PENDING' | 'TRANSCRIBED' | 'REJECTED' | 'SCORED' | 'SETTLED' | 'EXPIRED';
  /** One of the caller's OWN decks that already contains this recording, if any -- null when it isn't in any of them yet. */
  myDeckId: string | null;
  rawScore: string | null;
  score: string | null;
  compositeScore: string | null;
  audioUrl: string | null;
  createdAt: string;
}

export interface ValidatorRecordingsPage {
  items: ValidatorRecordingSummary[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export type ValidatorRecordingSortField = 'createdAt' | 'score' | 'compositeScore' | 'rawScore';

export interface ListValidatorRecordingsParams {
  page: number;
  pageSize: number;
  sortBy?: ValidatorRecordingSortField;
  sortDir?: 'asc' | 'desc';
  search?: string;
  dialectTag?: string;
  status?: ValidatorRecordingSummary['status'];
  minScore?: number;
  maxScore?: number;
}

export type ValidatorItemStatus = 'UNSCORED' | 'VALID' | 'INVALID' | 'REJECTED';

export type ValidatorFlagReason =
  | 'UNCLEAR_AUDIO'
  | 'EXCESSIVE_NOISE'
  | 'CLIPPING_OR_DISTORTION'
  | 'WRONG_LANGUAGE_OR_DIALECT'
  | 'MULTIPLE_SPEAKERS'
  | 'INCORRECT_PROMPT'
  | 'INCOMPLETE_RECORDING'
  | 'DUPLICATE_RECORDING'
  | 'UNABLE_TO_TRANSCRIBE'
  | 'OTHER';

export interface ValidatorDeckItem {
  id: string;
  deckId: string;
  recordingId: string;
  addedByUserId: string;
  addedAt: string;
  validationStatus: ValidatorItemStatus;
  validatorScore: string | null;
  validatorNotes: string | null;
  scoredAt: string | null;
  validatorTranscript: string | null;
  validatorTranscriptUpdatedAt: string | null;
  flagReason: ValidatorFlagReason | null;
  flagNote: string | null;
  flaggedByUserId: string | null;
  flaggedAt: string | null;
}

export type VdclVersionStatus =
  | 'DRAFT'
  | 'PENDING_COMPILATION'
  | 'PENDING_REVIEW'
  | 'PENDING_COUNTERSIGNATURE'
  | 'ACTIVE'
  | 'SUPERSEDED'
  | 'WITHDRAWN'
  | 'SUSPENDED'
  | 'REJECTED'
  | 'AMENDMENT_PENDING';

export type VdclPurpose =
  | 'ASR_TRAINING'
  | 'TTS_TRAINING'
  | 'LLM_TRAINING'
  | 'LINGUISTIC_RESEARCH'
  | 'DATASET_REDISTRIBUTION'
  | 'PUBLIC_PROMOTION'
  | 'BIOMETRIC_PROCESSING'
  | 'VOICE_CLONING';

export interface VdclInventoryPreview {
  eligibleCount: number;
  excludedCount: number;
  exclusionsByReason: Record<string, number>;
  totalDurationMs: string;
  transcriptCount: number;
  meanCompositeScore: number | null;
  /** Distinct dialects among the eligible recordings, sorted. */
  dialectTags: string[];
}

export interface VdclManifestInspection {
  versionId: string;
  status: VdclVersionStatus;
  licenceKey?: string;
  dialectTags?: string[];
  country?: { code: string; name: string } | null;
  purposes?: VdclPurpose[];
  manifestHash?: string | null;
  message?: string;
  manifest: {
    id: string;
    manifestKey: string;
    recordingCount: number;
    totalDurationMs: string;
    transcriptCount: number;
    excludedCount: number;
    meanCompositeScore: string | null;
    asrPipelineVersion: string | null;
    qualityPipelineVersion: string | null;
    scoreDefinitions: Record<string, string> | null;
    compiledAt: string;
  } | null;
  compilationJob: {
    stage: string;
    progressPercent: number;
    blockerMessage: string | null;
    failureReason: string | null;
    attempts: number;
  } | null;
  anomalies?: { kind: string; count: number; detail: string }[];
  items?: {
    id: string;
    recordingId: string;
    durationMs: number | null;
    dialectTag: string;
    compositeScore: string | null;
    score: string | null;
    hasTranscript: boolean;
    audioPurgedAt: string | null;
  }[];
  page?: number;
  pageSize?: number;
  totalItems?: number;
}

export interface VdclExclusionReport {
  versionId: string;
  recomputedAt: string;
  coveredInManifest: number;
  coveredStillEligible: number;
  coveredNoLongerEligible: number;
  eligibleButNotInManifest: number;
  exclusions: {
    reason: string;
    label: string;
    transient: boolean;
    count: number;
    sampleRecordingIds: string[];
  }[];
}

export interface VdclHashVerification {
  versionId: string;
  storedHash: string | null;
  recomputedHash: string;
  matches: boolean;
}

export interface VdclReadiness {
  ready: boolean;
  blockers: { requirement: string; detail: string; actionable: boolean }[];
  inventory: VdclInventoryPreview | null;
  /** Every dialect the contributor has eligible recordings in. */
  dialectTags: string[];
  existingAgreement: {
    id: string;
    licenceKey: string;
    withdrawnAt: string | null;
    activeVersionId: string | null;
  } | null;
}

export interface VdclVersionSummary {
  versionId: string;
  version: number;
  status: VdclVersionStatus;
  licenceKey: string;
  /** The dialects this VERSION covers, from its manifest. */
  dialectTags: string[];
  withdrawn: boolean;
  recordingCount: number | null;
  blockerMessage: string | null;
  /** Why Dialect Library sent this version back, if it did. */
  rejectionReason: string | null;
  rejectedAt: string | null;
  signedAt: string | null;
  countersignedAt: string | null;
  createdAt: string;
}

export interface VdclReviewPayload {
  versionId: string;
  version: number;
  status: VdclVersionStatus;
  licenceKey: string;
  dialectTags: string[];
  termsVersion: string | null;
  manifestHash: string | null;
  signedAt: string | null;
  countersignedAt: string | null;
  purposes: { purpose: VdclPurpose; wordingVersion: string }[];
  manifest: {
    manifestKey: string;
    recordingCount: number;
    totalDurationMs: string;
    transcriptCount: number;
    excludedCount: number;
    meanCompositeScore: string | null;
    asrPipelineVersion: string | null;
    scoreDefinitions: Record<string, string> | null;
    compiledAt: string;
  } | null;
}

export interface VdclTrackerStatus {
  versionId: string;
  licenceKey: string;
  status: VdclVersionStatus;
  stages: { stage: string; label: string; state: 'done' | 'current' | 'pending' | 'failed' }[];
  progressPercent: number;
  waitingOn: 'you' | 'dialect_library' | 'nobody';
  nextAction: string | null;
  blockerMessage: string | null;
  failureReason: string | null;
  estimatedCompletionAt: string | null;
  compiledAt: string | null;
  recordingCount: number | null;
  signedAt: string | null;
  countersignedAt: string | null;
}

export interface VdclSigningReceipt {
  versionId: string;
  licenceKey: string;
  signedAt: string;
  signatureKind: string | null;
  stepUpMethod: string | null;
  manifestHash: string | null;
  purposes: VdclPurpose[];
  status: VdclVersionStatus;
}

export interface StartVdclDraftInput {
  purposes: VdclPurpose[];
  wordingVersion: string;
  termsVersion?: string;
  locale?: string;
}

export interface StartVdclDraftResult {
  agreementId: string;
  licenceKey: string;
  versionId: string;
  version: number;
  dialectTag: string;
  compiled: boolean;
  compilationError: string | null;
  recordingCount: number | null;
  excludedCount: number | null;
  manifestHash: string | null;
}

/** Licence actions that require a confirmation code. */
export type VdclAdminActionName =
  | 'vdcl-suspend'
  | 'vdcl-reinstate'
  | 'vdcl-revoke'
  | 'vdcl-withdraw'
  | 'vdcl-reissue';

/** The step-up every guarded licence action carries. */
export interface VdclStepUp {
  otpRequestId?: string;
  code?: string;
}

/** A version as the ADMIN agreements list describes it. */
export interface VdclAdminVersionSummary {
  id: string;
  version: number;
  status: VdclVersionStatus;
  signedAt: string | null;
  countersignedAt: string | null;
  manifestHash: string | null;
  rejectionReason: string | null;
  rejectedAt: string | null;
  /** Non-null once documents have been issued -- gates the certificate view. */
  pdfKey: string | null;
  pngKey: string | null;
  _count: { grants: number };
}

export interface VdclAgreementSummary {
  id: string;
  licenceKey: string;
  contributorId: string;
  withdrawnAt: string | null;
  activeVersionId: string | null;
  createdAt: string;
  activeVersion: VdclAdminVersionSummary | null;
  /**
   * The most recent version whatever its status. activeVersion is null
   * until countersignature, so it could never show the one version that
   * actually needs an admin.
   */
  latestVersion: VdclAdminVersionSummary | null;
  _count: { versions: number };
}

export interface VdclAgreementDetail extends VdclAgreementSummary {
  contributor: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  };
  versions: {
    id: string;
    version: number;
    status: VdclVersionStatus;
    signedAt: string | null;
    countersignedAt: string | null;
    manifestHash: string | null;
    termsVersion: string | null;
    createdAt: string;
    grants: { purpose: VdclPurpose; wordingVersion: string; grantedAt: string }[];
    manifest: {
      manifestKey: string;
      recordingCount: number;
      totalDurationMs: string;
      transcriptCount: number;
      compiledAt: string;
    } | null;
    signatureEvents: {
      id: string;
      eventType: string;
      signatureKind: string | null;
      stepUpMethod: string | null;
      createdAt: string;
    }[];
  }[];
}

export interface VdclPublicVerification {
  outcome:
    | 'valid'
    | 'suspended'
    | 'withdrawn'
    | 'superseded'
    | 'not_yet_active'
    | 'hash_mismatch'
    | 'unknown';
  licenceKey: string | null;
  version: number | null;
  issuedAt: string | null;
  dialectTag: string | null;
  country: string | null;
  contributorLabel: string | null;
  recordingCount: number | null;
  totalDurationMs: string | null;
  transcriptCount: number | null;
  purposes: VdclPurpose[];
  hashMatches: boolean;
}

export interface VdclDocumentLink {
  url: string;
  expiresInSeconds: number;
  hash: string | null;
}

export interface VdclCompilationResult {
  versionId: string;
  manifestId: string;
  manifestKey: string;
  manifestHash: string;
  recordingCount: number;
  excludedCount: number;
  exclusionsByReason: Record<string, number>;
}

export interface ValidatorDeckSummary {
  id: string;
  name: string;
  createdByUserId: string;
  ownerUserId: string;
  status:
    | 'DRAFT'
    | 'PENDING_L2'
    | 'PENDING_L3'
    | 'PENDING_ADMIN'
    | 'APPROVED'
    | 'PUBLISHED'
    | 'REJECTED'
    | 'ARCHIVED';
  dialectTag: string | null;
  countryCode: string | null;
  createdAt: string;
  updatedAt: string;
  _count: { items: number };
}

export interface ValidatorDeckDetail extends Omit<ValidatorDeckSummary, '_count'> {
  items: ValidatorDeckItem[];
  expectedEarning: string;
}

export interface CreateValidatorDeckInput {
  name: string;
  countryId: string;
  dialectId: string;
  dialectVariantId?: string;
}

export interface ValidatorDialectAssignment {
  dialectId: string;
  dialectName: string;
  dialectTag: string;
  countryId: string;
  countryName: string;
  countryCode?: string;
}

export interface ScoreValidatorDeckItemInput {
  status: ValidatorItemStatus;
  score?: number;
  notes?: string;
}

export type ValidatorDeckAuditAction =
  | 'CREATED'
  | 'ITEM_ADDED'
  | 'ITEM_REMOVED'
  | 'SUBMITTED'
  | 'RESUBMITTED'
  | 'APPROVED'
  | 'REJECTED'
  | 'ADMIN_BYPASS_APPROVED'
  | 'PUBLISHED'
  | 'REASSIGNED'
  | 'CLONED'
  | 'ARCHIVED';

export interface ValidatorDeckAuditLogEntry {
  id: string;
  deckId: string;
  action: ValidatorDeckAuditAction;
  actorUserId: string;
  fromStatus: ValidatorDeckSummary['status'] | null;
  toStatus: ValidatorDeckSummary['status'] | null;
  reason: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface ReassignValidatorDeckInput {
  newOwnerUserId: string;
  penaltyPercent?: number;
}

export interface CloneFromStreamDeckInput {
  streamDeckId: string;
  targetOwnerUserId: string;
}

export interface AuditRecordingResult {
  id: string;
  kind: RecordingKind;
  adminAuditStatus: AdminAuditStatus;
  adminAuditedAt: string;
  clawedBack: boolean;
}

export type RecordingSortField =
  'createdAt' | 'score' | 'compositeScore' | 'rawScore' | 'payoutTokenAmount';

export interface ListAllRecordingsParams {
  page: number;
  pageSize: number;
  sortBy?: RecordingSortField;
  sortDir?: 'asc' | 'desc';
  search?: string;
  dialectTag?: string;
  status?: AdminRecordingSummary['status'];
  adminAuditStatus?: AdminAuditStatus;
  reviewState?: 'unreviewed';
  minScore?: number;
  maxScore?: number;
}

export interface UnsettledRow {
  id: string;
  kind: RecordingKind;
  status: 'PENDING' | 'SCORED';
  trainer: { id: string; email: string; firstName: string | null; lastName: string | null } | null;
  tokensSpent: string;
  score: string | null;
  scoredAt: string;
  pendingDelay: boolean;
  missingScore: boolean;
}

export interface UnsettledPage {
  items: UnsettledRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  stuckCount: number;
}

export interface SettleResult {
  id: string;
  payoutTokenAmount: string;
}

export interface SettleAllResult {
  settledCount: number;
  failedCount: number;
  skippedDelayCount: number;
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

export interface AdminSentenceTranslation {
  id: string;
  dialectTag: string;
  text: string;
  createdAt: string;
}

export interface AdminSentence {
  id: string;
  text: string;
  wordCount: number;
  createdAt: string;
  translations: AdminSentenceTranslation[];
}

export interface AdminSentencesPage {
  items: AdminSentence[];
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
  required: boolean;
  completionRewardTokens: string | null;
  sortOrder: number;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  author: { email: string };
}

export interface AdminCourseListItem extends Course {
  completedTrainerCount: number;
  totalTrainerCount: number;
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
  required?: boolean;
  completionRewardTokens?: number;
}

/** A required, published course this trainer hasn't completed yet -- blocks training when non-empty. */
export interface IncompleteRequiredCourse {
  id: string;
  slug: string;
  title: string;
}

/**
 * A required course this trainer is grandfathered out of: it became
 * required after they signed up, so it is suggested reading, never a gate.
 * Deliberately a distinct type from IncompleteRequiredCourse so a
 * suggestion can never be passed to a component that blocks on it.
 */
export interface SuggestedCourse {
  id: string;
  slug: string;
  title: string;
  summary: string;
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
  /** High-water mark of the furthest slide actually reached, one-at-a-time -- see CoursesService.saveProgress. Use this (not lastSlideIndex) to bound how far "Next" is allowed to resume. */
  maxSlideIndexReached: number;
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
  insufficientBalance?: boolean;
  requiredCourses?: IncompleteRequiredCourse[];
  qracRequired?: boolean;
  qracChecklist?: string[];
  poolExhausted?: boolean;
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

// Without a ceiling, a request caught mid-flight during an API deploy (or
// any other network stall) hangs forever -- fetchBaseQuery has no default
// timeout, and the browser's own TCP-level timeout can be minutes. This
// aborts and surfaces a retryable FETCH_ERROR instead, so a stuck screen
// (e.g. WordTrainingDialog's "Preparing your first word" spinner) fails
// visibly rather than silently.
const REQUEST_TIMEOUT_MS = 20_000;

const rawBaseQuery = fetchBaseQuery({
  baseUrl: PUBLIC_API_V1_BASE_URL,
  timeout: REQUEST_TIMEOUT_MS,
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
    const data = result.error.data as
      | { error?: string; authMaintenanceUntil?: string; authMaintenanceMessage?: string | null }
      | undefined;
    if (data?.error === 'AuthMaintenance') {
      notifyAuthMaintenance({
        until: data.authMaintenanceUntil ?? null,
        message: data.authMaintenanceMessage ?? null,
      });
    }
  }
  return result;
};

export const dialectivaApi = createApi({
  reducerPath: 'dialectivaApi',
  baseQuery: baseQueryWithMaintenanceSignal,
  tagTypes: [
    'ConnectAdmin',
    'Auth',
    'Wallet',
    'ReferralSettings',
    'DistributorSettings',
    'DistributorDashboard',
    'DistributorAllocations',
    'DistributorList',
    'DistributorActivity',
    'SubDistributorList',
    'SubDistributorActivity',
    'Users',
    'AdminCountries',
    'AdminDialects',
    'PlatformSettings',
    'BlogPosts',
    'Courses',
    'RequiredCourses',
    'Submissions',
    'DomainConversationSubmissions',
    'MisplacedDialectRecordings',
    'DomainPrompts',
    'AdminWords',
    'AdminSentences',
    'AdminRecordings',
    'AdminCommunitySpaces',
    'AdminCommunityTags',
    'AdminCommunityMembers',
    'AdminCommunitySettings',
    'AudioRetentionRules',
    'DataAccessLeads',
    'SupportRequests',
    'P2P',
    'P2PChat',
    'Profile',
    'Notifications',
    'ApiAccessTokens',
    'SubscriptionPlans',
    'Tokenomics',
    'AssistantThread',
    'AdminAssistantConversations',
    'PayoutAccounts',
    'PaymentMethodCatalog',
    'Kyc',
    'AdminSettlement',
    'ReferralInvites',
    'Testimony',
    'Marketing',
    'Faqs',
    'AdminSms',
    'ValidatorDecks',
    'ValidatorRecordings',
    'AdminValidatorDecks',
    'ValidatorDialectAssignments',
    'Integrations',
    'WhatsAppValidator',
    'VdclAgreements',
    'VdclManifest',
    'VdclMaker',
  ],
  endpoints: (builder) => ({
    register: builder.mutation<
      PendingOtp,
      {
        firstName: string;
        lastName: string;
        email: string;
        password: string;
        referralCode?: string;
        campaignShareId?: string;
      }
    >({
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
      invalidatesTags: ['ReferralInvites'],
    }),
    getReferralInvitations: builder.query<
      ReferralInvitationPage,
      { page?: number; pageSize?: number } | void
    >({
      query: (params) => ({ url: '/wallet/referrals/invitations', params: params ?? undefined }),
      providesTags: ['ReferralInvites'],
    }),
    getCountries: builder.query<Country[], void>({
      query: () => '/geo/countries',
    }),
    getDialects: builder.query<Dialect[], string>({
      query: (countryId) => `/geo/countries/${countryId}/dialects`,
    }),
    getAllDialects: builder.query<DialectSummary[], void>({
      query: () => '/geo/dialects',
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
    getP2PTradingEligibility: builder.query<P2PTradingEligibility, void>({
      query: () => '/p2p/eligibility',
      providesTags: ['P2P'],
    }),
    getP2PReferenceRate: builder.query<P2PReferenceRate, void>({
      query: () => '/p2p/reference-rate',
      providesTags: ['P2P'],
    }),
    getP2PPaymentInstructions: builder.query<{ p2pPaymentInstructions: string | null }, void>({
      query: () => '/p2p/payment-instructions',
      providesTags: ['P2P'],
    }),
    updateP2PPaymentInstructions: builder.mutation<
      { p2pPaymentInstructions: string | null },
      { p2pPaymentInstructions: string }
    >({
      query: (body) => ({ url: '/p2p/payment-instructions', method: 'PATCH', body }),
      invalidatesTags: ['P2P'],
    }),
    listP2POffers: builder.query<
      { items: P2POffer[]; total: number; page: number; pageSize: number; totalPages: number },
      {
        type?: P2POfferType;
        status?: P2POfferStatus;
        search?: string;
        fiatCurrency?: string;
        paymentMethod?: string;
        minTokenAmount?: number;
        maxTokenAmount?: number;
        minFiatAmount?: number;
        maxFiatAmount?: number;
        sortBy?: 'createdAt' | 'tokenAmount' | 'fiatAmount' | 'price';
        sortDir?: 'asc' | 'desc';
        page?: number;
        pageSize?: number;
      } | void
    >({
      query: (params) => ({ url: '/p2p/offers', params: params ?? undefined }),
      providesTags: ['P2P'],
    }),
    listMyP2POffers: builder.query<P2POffer[], void>({
      query: () => '/p2p/offers/mine',
      providesTags: ['P2P'],
    }),
    listIntegrations: builder.query<
      Integration[],
      {
        search?: string;
        sortBy?: 'name' | 'category' | 'createdAt' | 'sortOrder';
        sortDir?: 'asc' | 'desc';
      } | void
    >({
      query: (params) => ({ url: '/integrations', params: params ?? undefined }),
      providesTags: ['Integrations'],
    }),
    listMyIntegrations: builder.query<Integration[], void>({
      query: () => '/integrations/mine',
      providesTags: ['Integrations'],
    }),
    subscribeToIntegration: builder.mutation<Integration, string>({
      query: (id) => ({ url: `/integrations/${id}/subscribe`, method: 'POST' }),
      invalidatesTags: ['Integrations'],
    }),
    // Admin: the access-request queue and its approve/reject decision.
    listPeerReviewQueue: builder.query<
      { items: PeerReviewQueueItem[]; total: number; page: number; pageSize: number },
      { page?: number; pageSize?: number } | void
    >({
      query: (params) => ({ url: '/kyc-peer-review/queue', params: params ?? undefined }),
      providesTags: ['Integrations'],
    }),
    listMyPeerReviews: builder.query<
      { items: MyPeerReview[]; total: number; page: number; pageSize: number },
      { page?: number; pageSize?: number } | void
    >({
      query: (params) => ({ url: '/kyc-peer-review/mine', params: params ?? undefined }),
      providesTags: ['Integrations'],
    }),
    claimPeerReview: builder.mutation<PeerReviewSubject, string>({
      query: (id) => ({ url: `/kyc-peer-review/${id}/claim`, method: 'POST' }),
      invalidatesTags: ['Integrations'],
    }),
    releasePeerReview: builder.mutation<{ released: boolean }, string>({
      query: (id) => ({ url: `/kyc-peer-review/${id}/release`, method: 'POST' }),
      invalidatesTags: ['Integrations'],
    }),
    submitPeerReview: builder.mutation<
      PeerReviewTally,
      { id: string; verdict: 'APPROVE' | 'DECLINE'; documentNumber?: string; declineReason?: string }
    >({
      query: ({ id, ...body }) => ({
        url: `/kyc-peer-review/${id}/review`,
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Integrations', 'Wallet'],
    }),
    // Same blob->object-URL handling as the admin evidence route; consumers
    // must revoke the URL on unmount/change.
    getPeerReviewEvidenceImage: builder.query<
      string,
      { verificationId: string; evidenceId: string }
    >({
      query: ({ verificationId, evidenceId }) => ({
        url: `/kyc-peer-review/${verificationId}/evidence/${evidenceId}`,
        responseHandler: (response: Response) => response.blob(),
      }),
      transformResponse: (blob: Blob) => URL.createObjectURL(blob),
    }),
    getAdminPeerReviewQueue: builder.query<AdminPeerReviewItem[], void>({
      query: () => '/kyc-peer-review/admin/queue',
      providesTags: ['Integrations'],
    }),
    resetPeerReviews: builder.mutation<{ reset: boolean; cleared: number }, string>({
      query: (id) => ({ url: `/kyc-peer-review/admin/${id}/reset`, method: 'POST' }),
      invalidatesTags: ['Integrations'],
    }),
    getAdminIntegrationSubscriptions: builder.query<
      AdminIntegrationSubscription[],
      { status?: IntegrationSubscriptionStatus; slug?: string } | void
    >({
      query: (params) => ({
        url: '/integrations/admin/subscriptions',
        params: params ?? undefined,
      }),
      providesTags: ['Integrations'],
    }),
    setIntegrationSubscriptionCertified: builder.mutation<
      AdminIntegrationSubscription,
      { id: string; certified: boolean }
    >({
      query: ({ id, certified }) => ({
        url: `/integrations/admin/subscriptions/${id}/certified`,
        method: 'PATCH',
        body: { certified },
      }),
      invalidatesTags: ['Integrations'],
    }),
    reviewIntegrationSubscription: builder.mutation<
      AdminIntegrationSubscription,
      { id: string; decision: 'approve' | 'reject'; reviewNote?: string }
    >({
      query: ({ id, ...body }) => ({
        url: `/integrations/admin/subscriptions/${id}`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['Integrations'],
    }),
    unsubscribeFromIntegration: builder.mutation<{ unsubscribed: boolean }, string>({
      query: (id) => ({ url: `/integrations/${id}/subscribe`, method: 'DELETE' }),
      invalidatesTags: ['Integrations'],
    }),
    requestWhatsAppValidation: builder.mutation<
      WhatsAppValidationRequestResult,
      { phoneNumber: string }
    >({
      query: (body) => ({ url: '/whatsapp-validator/requests', method: 'POST', body }),
      invalidatesTags: ['WhatsAppValidator', 'Profile'],
    }),
    // The code is only ever shown once (never persisted in plaintext) --
    // this replaces the requester's live request with a fresh code/hash
    // when they've lost the one they were shown (closed the tab, reloaded
    // the page). Does not touch an existing claim -- a claim is permanent
    // until explicitly released/cancelled, see releaseWhatsAppValidationClaim.
    regenerateWhatsAppValidationCode: builder.mutation<{ requestId: string; code: string }, void>({
      query: () => ({ url: '/whatsapp-validator/requests/mine/regenerate', method: 'POST' }),
      invalidatesTags: ['WhatsAppValidator'],
    }),
    // Requester-only: frees the current validator's claim without
    // cancelling the request itself, returning it to PENDING for another
    // subscribed validator to pick up.
    releaseWhatsAppValidationClaim: builder.mutation<{ released: boolean }, void>({
      query: () => ({ url: '/whatsapp-validator/requests/mine/release-claim', method: 'POST' }),
      invalidatesTags: ['WhatsAppValidator'],
    }),
    // Requester-only: withdraws the request entirely (terminal CANCELLED
    // status), from either PENDING or CLAIMED.
    cancelWhatsAppValidationRequest: builder.mutation<{ cancelled: boolean }, void>({
      query: () => ({ url: '/whatsapp-validator/requests/mine/cancel', method: 'POST' }),
      invalidatesTags: ['WhatsAppValidator'],
    }),
    // The requester's own single request (there's at most one live one at a
    // time), not a history list -- null when they have none.
    getMyWhatsAppValidationRequest: builder.query<WhatsAppValidationMyRequest | null, void>({
      query: () => '/whatsapp-validator/requests/mine',
      providesTags: ['WhatsAppValidator'],
    }),
    listPendingWhatsAppValidations: builder.query<
      WhatsAppValidationPendingPage,
      { page?: number; pageSize?: number } | void
    >({
      query: (params) => ({
        url: '/whatsapp-validator/pending',
        params: { page: params?.page, pageSize: params?.pageSize },
      }),
      providesTags: ['WhatsAppValidator'],
    }),
    // Lightweight badge count for the P2P nav -- returns 0 (never an error)
    // when the caller isn't subscribed, unlike listPendingWhatsAppValidations.
    getWhatsAppValidationPendingCount: builder.query<{ count: number }, void>({
      query: () => '/whatsapp-validator/pending/count',
      providesTags: ['WhatsAppValidator'],
    }),
    // A validator may hold several concurrent claims (admin-configurable
    // via Integration.maxConcurrentClaims) -- this is now a list, not a
    // single request.
    listMyWhatsAppValidationClaims: builder.query<WhatsAppValidationClaim[], void>({
      query: () => '/whatsapp-validator/my-claims',
      providesTags: ['WhatsAppValidator'],
    }),
    claimWhatsAppValidation: builder.mutation<WhatsAppValidationClaim, string>({
      query: (id) => ({ url: `/whatsapp-validator/requests/${id}/claim`, method: 'POST' }),
      invalidatesTags: ['WhatsAppValidator'],
    }),
    verifyWhatsAppValidationRequest: builder.mutation<
      WhatsAppValidationClaim,
      { id: string; code: string }
    >({
      query: ({ id, code }) => ({
        url: `/whatsapp-validator/requests/${id}/verify`,
        method: 'POST',
        body: { code },
      }),
      invalidatesTags: ['WhatsAppValidator', 'Wallet'],
    }),
    rejectWhatsAppValidationRequest: builder.mutation<{ released: boolean }, string>({
      query: (id) => ({ url: `/whatsapp-validator/requests/${id}/reject`, method: 'POST' }),
      invalidatesTags: ['WhatsAppValidator'],
    }),
    getP2PTraderProfile: builder.query<P2PTraderProfile, string>({
      query: (userId) => `/p2p/traders/${userId}`,
    }),
    requestP2PTradeOtp: builder.mutation<
      { otpRequestId: string; expiresInSeconds: number },
      | {
          action: 'create-offer';
          type: P2POfferType;
          tokenAmount: number;
          fiatCurrency: string;
          paymentMethod: string;
          paymentMethodIds?: string[];
        }
      | { action: 'accept-offer'; offerId: string }
    >({
      query: (body) => ({ url: '/p2p/offers/otp', method: 'POST', body }),
    }),
    createP2POffer: builder.mutation<
      P2POffer,
      {
        type: P2POfferType;
        tokenAmount: number;
        fiatCurrency: string;
        paymentMethod: string;
        paymentMethodIds?: string[];
        otpRequestId?: string;
        code?: string;
      }
    >({
      query: (body) => ({ url: '/p2p/offers', method: 'POST', body }),
      invalidatesTags: ['P2P', 'Wallet'],
    }),
    acceptP2POffer: builder.mutation<
      P2PTrade,
      { id: string; sellerPaymentMethodId?: string; otpRequestId?: string; code?: string }
    >({
      query: ({ id, ...body }) => ({ url: `/p2p/offers/${id}/accept`, method: 'POST', body }),
      invalidatesTags: ['P2P', 'Wallet'],
    }),
    cancelP2POffer: builder.mutation<P2POffer, string>({
      query: (id) => ({ url: `/p2p/offers/${id}/cancel`, method: 'POST' }),
      invalidatesTags: ['P2P', 'Wallet'],
    }),
    // Owner edit/delete of a post nobody has traded against. Both invalidate
    // Wallet as well as P2P: editing a SELL amount moves escrow, and
    // deleting one releases it.
    updateP2POffer: builder.mutation<
      P2POffer,
      {
        id: string;
        tokenAmount?: number;
        fiatCurrency?: string;
        paymentMethod?: string;
        paymentMethodIds?: string[];
      }
    >({
      query: ({ id, ...body }) => ({ url: `/p2p/offers/${id}`, method: 'PATCH', body }),
      invalidatesTags: ['P2P', 'Wallet'],
    }),
    deleteP2POffer: builder.mutation<{ id: string; deleted: boolean }, string>({
      query: (id) => ({ url: `/p2p/offers/${id}`, method: 'DELETE' }),
      invalidatesTags: ['P2P', 'Wallet'],
    }),
    listMyP2PTrades: builder.query<P2PTrade[], { status?: P2PTradeStatus } | void>({
      query: (params) => ({ url: '/p2p/trades/mine', params: params ?? undefined }),
      providesTags: ['P2P'],
    }),
    getP2PTrade: builder.query<P2PTrade, string>({
      query: (id) => `/p2p/trades/${id}`,
      providesTags: ['P2P'],
    }),
    // Fetching an offer is what records a view, so this must not be served
    // from cache on a revisit -- keepUnusedDataFor: 0 makes each visit to the
    // detail page a real request, which is the event we are counting.
    getP2POffer: builder.query<P2POffer, string>({
      query: (id) => `/p2p/offers/${id}`,
      providesTags: ['P2P'],
      keepUnusedDataFor: 0,
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
    raiseP2PDispute: builder.mutation<
      P2PTrade,
      { id: string; reason: string; evidenceUrl?: string }
    >({
      query: ({ id, reason, evidenceUrl }) => ({
        url: `/p2p/trades/${id}/dispute`,
        method: 'POST',
        body: { reason, evidenceUrl },
      }),
      invalidatesTags: ['P2P'],
    }),
    listP2PTradeMessages: builder.query<P2PTradeMessage[], string>({
      query: (tradeId) => `/p2p/trades/${tradeId}/messages`,
      providesTags: (_result, _error, tradeId) => [{ type: 'P2PChat', id: tradeId }],
    }),
    sendP2PTradeMessage: builder.mutation<
      P2PTradeMessage,
      { tradeId: string; body?: string; attachmentKey?: string; attachmentContentType?: string }
    >({
      query: ({ tradeId, ...body }) => ({
        url: `/p2p/trades/${tradeId}/messages`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (_result, _error, { tradeId }) => [{ type: 'P2PChat', id: tradeId }],
    }),
    createP2PChatUploadUrl: builder.mutation<
      { uploadUrl: string; key: string; bucket: string; expiresInSeconds: number },
      { tradeId: string; contentType: string }
    >({
      query: ({ tradeId, contentType }) => ({
        url: `/p2p/trades/${tradeId}/messages/upload-url`,
        method: 'POST',
        body: { contentType },
      }),
    }),
    getP2PChatAttachmentUrl: builder.query<
      { url: string; expiresInSeconds: number },
      { tradeId: string; messageId: string }
    >({
      query: ({ tradeId, messageId }) => `/p2p/trades/${tradeId}/messages/${messageId}/attachment`,
    }),
    getTrainerDashboard: builder.query<TrainerDashboardSummary, void>({
      query: () => '/wallet/dashboard',
      providesTags: ['Wallet'],
    }),
    getCommunityStats: builder.query<CommunityStats, void>({
      query: () => '/community/stats',
    }),
    getAdminCommunitySpaces: builder.query<AdminCommunitySpace[], void>({
      query: () => '/admin/community/spaces',
      providesTags: ['AdminCommunitySpaces'],
    }),
    createAdminCommunitySpace: builder.mutation<AdminCommunitySpace, UpsertCommunitySpaceInput>({
      query: (body) => ({ url: '/admin/community/spaces', method: 'POST', body }),
      invalidatesTags: ['AdminCommunitySpaces'],
    }),
    updateAdminCommunitySpace: builder.mutation<
      AdminCommunitySpace,
      { id: string; body: Partial<UpsertCommunitySpaceInput> }
    >({
      query: ({ id, body }) => ({ url: `/admin/community/spaces/${id}`, method: 'PATCH', body }),
      invalidatesTags: ['AdminCommunitySpaces'],
    }),
    deleteAdminCommunitySpace: builder.mutation<{ id: string; deleted: boolean }, string>({
      query: (id) => ({ url: `/admin/community/spaces/${id}`, method: 'DELETE' }),
      invalidatesTags: ['AdminCommunitySpaces'],
    }),
    reorderAdminCommunitySpaces: builder.mutation<AdminCommunitySpace[], { orderedIds: string[] }>({
      query: (body) => ({ url: '/admin/community/spaces/reorder', method: 'PATCH', body }),
      invalidatesTags: ['AdminCommunitySpaces'],
    }),
    getAdminCommunityTags: builder.query<AdminCommunityTag[], void>({
      query: () => '/admin/community/tags',
      providesTags: ['AdminCommunityTags'],
    }),
    createAdminCommunityTag: builder.mutation<AdminCommunityTag, { name: string }>({
      query: (body) => ({ url: '/admin/community/tags', method: 'POST', body }),
      invalidatesTags: ['AdminCommunityTags'],
    }),
    renameAdminCommunityTag: builder.mutation<AdminCommunityTag, { id: string; name: string }>({
      query: ({ id, name }) => ({
        url: `/admin/community/tags/${id}`,
        method: 'PATCH',
        body: { name },
      }),
      invalidatesTags: ['AdminCommunityTags'],
    }),
    mergeAdminCommunityTags: builder.mutation<AdminCommunityTag, { id: string; targetId: string }>({
      query: ({ id, targetId }) => ({
        url: `/admin/community/tags/${id}/merge/${targetId}`,
        method: 'POST',
      }),
      invalidatesTags: ['AdminCommunityTags'],
    }),
    hideAdminCommunityTag: builder.mutation<AdminCommunityTag, { id: string; isHidden: boolean }>({
      query: ({ id, isHidden }) => ({
        url: `/admin/community/tags/${id}/hidden`,
        method: 'PATCH',
        body: { isHidden },
      }),
      invalidatesTags: ['AdminCommunityTags'],
    }),
    deleteAdminCommunityTag: builder.mutation<void, string>({
      query: (id) => ({ url: `/admin/community/tags/${id}`, method: 'DELETE' }),
      invalidatesTags: ['AdminCommunityTags'],
    }),
    getAdminCommunityMembers: builder.query<
      AdminCommunityMembersPage,
      {
        page: number;
        pageSize: number;
        search?: string;
        status?: CommunityMemberStatus;
        role?: CommunityMemberRole;
      }
    >({
      query: (params) => ({ url: '/admin/community/members', params }),
      providesTags: ['AdminCommunityMembers'],
    }),
    getAdminCommunityMember: builder.query<AdminCommunityMemberDetail, string>({
      query: (id) => `/admin/community/members/${id}`,
      providesTags: (_result, _error, id) => [{ type: 'AdminCommunityMembers', id }],
    }),
    suspendCommunityMember: builder.mutation<void, { id: string; reason?: string }>({
      query: ({ id, reason }) => ({
        url: `/admin/community/moderation/users/${id}/suspend`,
        method: 'POST',
        body: { reason },
      }),
      invalidatesTags: ['AdminCommunityMembers'],
    }),
    banCommunityMember: builder.mutation<void, { id: string; reason?: string }>({
      query: ({ id, reason }) => ({
        url: `/admin/community/moderation/users/${id}/ban`,
        method: 'POST',
        body: { reason },
      }),
      invalidatesTags: ['AdminCommunityMembers'],
    }),
    restoreCommunityMember: builder.mutation<void, string>({
      query: (id) => ({ url: `/admin/community/moderation/users/${id}/restore`, method: 'POST' }),
      invalidatesTags: ['AdminCommunityMembers'],
    }),
    getAdminCommunitySettings: builder.query<CommunitySettingsAdmin, void>({
      query: () => '/admin/community/settings',
      providesTags: ['AdminCommunitySettings'],
    }),
    updateAdminCommunitySettings: builder.mutation<
      CommunitySettingsAdmin,
      Partial<CommunitySettingsAdmin>
    >({
      query: (body) => ({ url: '/admin/community/settings', method: 'PATCH', body }),
      invalidatesTags: ['AdminCommunitySettings'],
    }),
    getAdminCommunityPostsByAuthor: builder.query<
      AdminCommunityContentPage<{
        id: string;
        title: string;
        slug: string;
        status: string;
        createdAt: string;
        space: { name: string; slug: string };
      }>,
      { authorId: string; page?: number; pageSize?: number }
    >({
      query: (params) => ({ url: '/admin/community/posts', params }),
    }),
    getAdminCommunityReplies: builder.query<
      AdminCommunityContentPage<{
        id: string;
        body: string;
        createdAt: string;
        post: { id: string; title: string; slug: string };
      }>,
      { authorId?: string; postId?: string; page?: number; pageSize?: number }
    >({
      query: (params) => ({ url: '/admin/community/replies', params }),
    }),
    getTrainerReport: builder.query<TrainerReport, { from?: string; to?: string }>({
      query: ({ from, to }) => ({ url: '/wallet/report', params: { from, to } }),
      providesTags: ['Wallet'],
    }),
    emailTrainerReport: builder.mutation<{ sent: boolean }, { from?: string; to?: string }>({
      query: ({ from, to }) => ({
        url: '/wallet/report/email',
        method: 'POST',
        params: { from, to },
      }),
    }),
    getEarningHistory: builder.query<
      EarningHistoryPage,
      { page: number; pageSize: number; from?: string; to?: string }
    >({
      query: ({ page, pageSize, from, to }) => ({
        url: '/wallet/earnings',
        params: { page, pageSize, from, to },
      }),
      providesTags: ['Wallet'],
    }),
    getWalletActivity: builder.query<
      WalletActivityPage,
      { page: number; pageSize: number; category?: 'earned' | 'other-credits' }
    >({
      query: ({ page, pageSize, category }) => ({
        url: '/wallet/activity',
        params: { page, pageSize, category },
      }),
      providesTags: ['Wallet'],
    }),
    getEarningsChart: builder.query<EarningsChart, { range: EarningsChartRange }>({
      query: ({ range }) => ({ url: '/wallet/earnings-chart', params: { range } }),
      providesTags: ['Wallet'],
    }),
    getMyWordRecordings: builder.query<
      SubmissionsPage,
      { page: number; pageSize: number; status?: TrainerSubmissionSummary['status'][] }
    >({
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
    signQrac: builder.mutation<{ version: string; signedAt: string }, string>({
      query: (sessionId) => ({ url: `/words/sessions/${sessionId}/qrac`, method: 'POST' }),
    }),
    listMyTestimonies: builder.query<Testimony[], void>({
      query: () => '/testimonials/mine',
      providesTags: ['Testimony'],
    }),
    createTestimonyUploadUrl: builder.mutation<TestimonyUpload, { contentType: string }>({
      query: (body) => ({ url: '/testimonials/upload-url', method: 'POST', body }),
    }),
    submitTestimony: builder.mutation<Testimony, SubmitTestimonyInput>({
      query: (body) => ({ url: '/testimonials', method: 'POST', body }),
      invalidatesTags: ['Testimony'],
    }),
    // Only permitted while the testimony is still PENDING -- the API rejects
    // a delete once it has been reviewed.
    deleteMyTestimony: builder.mutation<{ id: string; deleted: boolean }, string>({
      query: (id) => ({ url: `/testimonials/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Testimony'],
    }),
    getAdminTestimonials: builder.query<
      TestimonyAdminPage,
      { page?: number; pageSize?: number; status?: TestimonyStatus } | void
    >({
      query: (params) => ({ url: '/admin/testimonials', params: params ?? undefined }),
      providesTags: ['Testimony'],
    }),
    reviewTestimony: builder.mutation<
      Testimony,
      { id: string; status: 'APPROVED' | 'REJECTED'; rejectionReason?: string }
    >({
      query: ({ id, ...body }) => ({ url: `/admin/testimonials/${id}`, method: 'PATCH', body }),
      invalidatesTags: ['Testimony'],
    }),
    updateTestimonyText: builder.mutation<Testimony, { id: string; text: string }>({
      query: ({ id, text }) => ({
        url: `/admin/testimonials/${id}/text`,
        method: 'PATCH',
        body: { text },
      }),
      invalidatesTags: ['Testimony'],
    }),
    setTestimonyVisibility: builder.mutation<Testimony, { id: string; visible: boolean }>({
      query: ({ id, visible }) => ({
        url: `/admin/testimonials/${id}/visibility`,
        method: 'PATCH',
        body: { visible },
      }),
      invalidatesTags: ['Testimony'],
    }),
    getMarketingMaterials: builder.query<MarketingMaterials, MarketingAdFormat | void>({
      query: (format) => ({ url: '/marketing/materials', params: format ? { format } : undefined }),
      providesTags: ['Marketing'],
    }),
    createCampaignShare: builder.mutation<
      MarketingCampaignShare,
      { photoId: string; headlineId: string }
    >({
      query: (body) => ({ url: '/marketing/shares', method: 'POST', body }),
      invalidatesTags: ['Marketing'],
    }),
    getMyMarketingShares: builder.query<MyMarketingShare[], void>({
      query: () => '/marketing/shares/mine',
      providesTags: ['Marketing'],
    }),
    getAdminMarketingPhotos: builder.query<AdminMarketingAdPhoto[], MarketingAdFormat | void>({
      query: (format) => ({
        url: '/admin/marketing/photos',
        params: format ? { format } : undefined,
      }),
      providesTags: ['Marketing'],
    }),
    createMarketingPhotoUploadUrl: builder.mutation<
      TestimonyUpload,
      { format: MarketingAdFormat; contentType: string }
    >({
      query: (body) => ({ url: '/admin/marketing/photos/upload-url', method: 'POST', body }),
    }),
    createMarketingPhoto: builder.mutation<
      AdminMarketingAdPhoto,
      { format: MarketingAdFormat; bucket: string; key: string }
    >({
      query: (body) => ({ url: '/admin/marketing/photos', method: 'POST', body }),
      invalidatesTags: ['Marketing'],
    }),
    updateMarketingPhoto: builder.mutation<
      AdminMarketingAdPhoto,
      { id: string; active?: boolean; sortOrder?: number }
    >({
      query: ({ id, ...body }) => ({ url: `/admin/marketing/photos/${id}`, method: 'PATCH', body }),
      invalidatesTags: ['Marketing'],
    }),
    deleteMarketingPhoto: builder.mutation<void, string>({
      query: (id) => ({ url: `/admin/marketing/photos/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Marketing'],
    }),
    getAdminMarketingHeadlines: builder.query<AdminMarketingHeadline[], MarketingAdFormat | void>({
      query: (format) => ({
        url: '/admin/marketing/headlines',
        params: format ? { format } : undefined,
      }),
      providesTags: ['Marketing'],
    }),
    createMarketingHeadline: builder.mutation<
      AdminMarketingHeadline,
      { format: MarketingAdFormat; title: string; description: string }
    >({
      query: (body) => ({ url: '/admin/marketing/headlines', method: 'POST', body }),
      invalidatesTags: ['Marketing'],
    }),
    updateMarketingHeadline: builder.mutation<
      AdminMarketingHeadline,
      { id: string; title?: string; description?: string; active?: boolean; sortOrder?: number }
    >({
      query: ({ id, ...body }) => ({
        url: `/admin/marketing/headlines/${id}`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['Marketing'],
    }),
    deleteMarketingHeadline: builder.mutation<void, string>({
      query: (id) => ({ url: `/admin/marketing/headlines/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Marketing'],
    }),
    createWordRecordingUpload: builder.mutation<
      WordRecordingUpload,
      { assignmentId: string; contentType: string }
    >({
      query: (body) => ({ url: '/words/recordings/upload-url', method: 'POST', body }),
    }),
    submitWordRecording: builder.mutation<
      {
        recordingId: string;
        status: string;
        direction: WordTrainingDirection;
        validationScore: number | null;
      },
      {
        assignmentId: string;
        responseText?: string;
        bucket?: string;
        audioKey?: string;
        durationMs?: number;
        noiseRating?: RecordingNoiseRating;
      }
    >({
      query: (body) => ({ url: '/words/recordings', method: 'POST', body }),
      invalidatesTags: ['Submissions', 'Wallet'],
    }),
    getNextDomainConversationPrompt: builder.query<DomainConversationPrompt, string>({
      query: (sessionId) => `/domain-conversations/sessions/${sessionId}/next`,
    }),
    createDomainConversationRecordingUpload: builder.mutation<
      DomainConversationRecordingUpload,
      { assignmentId: string; contentType: string }
    >({
      query: (body) => ({
        url: '/domain-conversations/recordings/upload-url',
        method: 'POST',
        body,
      }),
    }),
    submitDomainConversationRecording: builder.mutation<
      { recordingId: string; status: string },
      {
        assignmentId: string;
        bucket: string;
        audioKey: string;
        durationMs: number;
        noiseRating: RecordingNoiseRating;
      }
    >({
      query: (body) => ({ url: '/domain-conversations/recordings', method: 'POST', body }),
      invalidatesTags: ['DomainConversationSubmissions', 'Wallet'],
    }),
    getMyDomainConversationRecordings: builder.query<
      DomainConversationSubmissionsPage,
      { page: number; pageSize: number; status?: DomainConversationSubmissionSummary['status'][] }
    >({
      query: ({ page, pageSize, status }) => ({
        url: '/domain-conversations/mine',
        params: { page, pageSize, status: status?.join(',') },
      }),
      providesTags: ['DomainConversationSubmissions'],
    }),
    getNextWordValidationItem: builder.query<WordValidationItem, string>({
      query: (sessionId) => `/word-validation/sessions/${sessionId}/next`,
    }),
    submitWordValidation: builder.mutation<
      { validationId: string; rewarded: boolean; rewardAmount: string | null; misplaced: boolean },
      {
        recordingId: string;
        presentmentToken?: string;
        selectedWordId?: string;
        transcript?: string;
        flags?: WordValidationFlag[];
      }
    >({
      query: (body) => ({ url: '/word-validation/submit', method: 'POST', body }),
      invalidatesTags: ['Wallet'],
    }),
    getMisplacedDialectRecordings: builder.query<
      MisplacedDialectRecordingsPage,
      { page: number; pageSize: number }
    >({
      query: ({ page, pageSize }) => ({
        url: '/word-validation/admin/misplaced-dialects',
        params: { page, pageSize },
      }),
      providesTags: ['MisplacedDialectRecordings'],
    }),
    resolveMisplacedDialectRecording: builder.mutation<
      { status: string; dialectTag?: string },
      { id: string; action: 'DELETE' | 'REASSIGN'; dialectTag?: string; dialectVariantId?: string }
    >({
      query: ({ id, ...body }) => ({
        url: `/word-validation/admin/misplaced-dialects/${id}/resolve`,
        method: 'POST',
        body,
      }),
      invalidatesTags: ['MisplacedDialectRecordings'],
    }),
    getAdminDomainPrompts: builder.query<
      AdminDomainPromptsPage,
      {
        page: number;
        pageSize: number;
        search?: string;
        domain?: string;
        genderVariant?: DomainPromptGenderVariant;
        disabled?: boolean;
      }
    >({
      query: (params) => ({ url: '/domain-conversations/admin/prompts', params }),
      providesTags: ['DomainPrompts'],
    }),
    getAdminDomainPromptDomains: builder.query<string[], void>({
      query: () => '/domain-conversations/admin/prompts/domains',
      providesTags: ['DomainPrompts'],
    }),
    createDomainPromptAdmin: builder.mutation<
      AdminDomainPrompt[],
      {
        domain: string;
        scenarioKey: string;
        neutralText: string;
        maleText: string;
        femaleText: string;
      }
    >({
      query: (body) => ({ url: '/domain-conversations/admin/prompts', method: 'POST', body }),
      invalidatesTags: ['DomainPrompts'],
    }),
    updateDomainPromptAdmin: builder.mutation<
      AdminDomainPrompt,
      { id: string; domain?: string; text?: string }
    >({
      query: ({ id, ...body }) => ({
        url: `/domain-conversations/admin/prompts/${id}`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['DomainPrompts'],
    }),
    setDomainPromptDisabledAdmin: builder.mutation<
      { id: string; isDisabled: boolean },
      { id: string; disabled: boolean }
    >({
      query: ({ id, disabled }) => ({
        url: `/domain-conversations/admin/prompts/${id}/disable`,
        method: 'PATCH',
        body: { disabled },
      }),
      invalidatesTags: ['DomainPrompts'],
    }),
    deleteDomainPromptAdmin: builder.mutation<{ id: string; deleted: boolean }, string>({
      query: (id) => ({ url: `/domain-conversations/admin/prompts/${id}`, method: 'DELETE' }),
      invalidatesTags: ['DomainPrompts'],
    }),
    requestDepositOtp: builder.mutation<
      { otpRequestId: string; expiresInSeconds: number },
      { usdAmount: number; currency: 'USDC' | 'USDT' }
    >({
      query: (body) => ({ url: '/wallet/deposits/otp', method: 'POST', body }),
    }),
    createTokenDeposit: builder.mutation<
      { depositId: string; hostedCheckoutUrl: string },
      { usdAmount: number; currency: 'USDC' | 'USDT'; otpRequestId: string; code: string }
    >({
      query: (body) => ({ url: '/wallet/deposits', method: 'POST', body }),
    }),
    requestFlutterwaveDepositOtp: builder.mutation<
      { otpRequestId: string; expiresInSeconds: number },
      { usdAmount: number; currency: string }
    >({
      query: (body) => ({ url: '/wallet/deposits/flutterwave/otp', method: 'POST', body }),
    }),
    createFlutterwaveDeposit: builder.mutation<
      | { depositId: string; hostedCheckoutUrl: string }
      | {
          depositId: string;
          virtualAccount: { accountNumber: string; bankName: string; note: string | null };
        }
      | { depositId: string; redirectUrl: string | null },
      {
        usdAmount: number;
        currency: string;
        country: string;
        method?: 'bank_transfer' | 'mobile_money';
        mobileMoneyNetwork?: string;
        mobileMoneyNumber?: string;
        otpRequestId: string;
        code: string;
      }
    >({
      query: (body) => ({ url: '/wallet/deposits/flutterwave', method: 'POST', body }),
    }),
    verifyFlutterwaveDeposit: builder.query<
      { depositId: string; status: string; credited: boolean },
      string
    >({
      query: (id) => ({ url: `/wallet/deposits/flutterwave/${id}/verify` }),
    }),
    checkFlutterwaveDepositStatus: builder.mutation<
      { depositId: string; status: string; credited: boolean },
      string
    >({
      query: (id) => ({ url: `/wallet/deposits/flutterwave/${id}/check-status`, method: 'POST' }),
    }),
    getWithdrawalMinAmount: builder.query<
      {
        currency: WithdrawalCurrency;
        network: WithdrawalNetwork;
        minAmount: number;
        minTokens: string;
      },
      { currency: WithdrawalCurrency; network: WithdrawalNetwork }
    >({
      query: (params) => ({ url: '/wallet/withdrawal-min-amount', params }),
    }),
    requestWithdrawalOtp: builder.mutation<
      { otpRequestId: string; expiresInSeconds: number },
      {
        tokenAmount: number;
        destinationAddress?: string;
        destinationCurrency?: WithdrawalCurrency;
        destinationNetwork?: WithdrawalNetwork;
        payoutMethod?: PayoutMethod;
        payoutAccountId?: string;
      }
    >({
      query: (body) => ({ url: '/wallet/withdrawals/otp', method: 'POST', body }),
    }),
    createWithdrawal: builder.mutation<
      { withdrawalId: string; status: string },
      {
        tokenAmount: number;
        destinationAddress?: string;
        destinationCurrency?: WithdrawalCurrency;
        destinationNetwork?: WithdrawalNetwork;
        payoutMethod?: PayoutMethod;
        payoutAccountId?: string;
        otpRequestId: string;
        code: string;
      }
    >({
      query: (body) => ({ url: '/wallet/withdrawals', method: 'POST', body }),
      invalidatesTags: ['Wallet'],
    }),
    listAdminWithdrawals: builder.query<
      {
        items: AdminWithdrawalRequest[];
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
      },
      { status?: WithdrawalStatus; page?: number; pageSize?: number; search?: string } | void
    >({
      query: (params) => ({ url: '/admin/withdrawals', params: params ?? undefined }),
      providesTags: ['Wallet'],
    }),
    listPayoutAccounts: builder.query<PayoutAccount[], void>({
      query: () => ({ url: '/payout-accounts' }),
      providesTags: ['PayoutAccounts'],
    }),
    createPayoutAccount: builder.mutation<
      PayoutAccount & { onboardingUrl?: string },
      {
        type: 'BANK' | 'MOBILE_MONEY' | 'STRIPE_CONNECT' | 'STABLECOIN_WALLET';
        country?: string;
        currency?: string;
        bankCode?: string;
        bankName?: string;
        accountNumber?: string;
        mobileMoneyNetwork?: string;
        mobileMoneyNumber?: string;
        freeEntry?: boolean;
        stablecoinAsset?: 'USDT' | 'USDC';
        stablecoinNetwork?: 'TRC20' | 'ERC20' | 'BEP20' | 'SOL' | 'POLYGON';
        walletAddress?: string;
        otpRequestId?: string;
        code?: string;
        isDefault?: boolean;
      }
    >({
      query: (body) => ({ url: '/payout-accounts', method: 'POST', body }),
      invalidatesTags: ['PayoutAccounts'],
    }),
    requestPayoutAccountSetupOtp: builder.mutation<
      { otpRequestId: string; expiresInSeconds: number },
      {
        type: 'BANK' | 'MOBILE_MONEY' | 'STABLECOIN_WALLET';
        bankCode?: string;
        bankName?: string;
        accountNumber?: string;
        mobileMoneyNetwork?: string;
        mobileMoneyNumber?: string;
        freeEntry?: boolean;
        stablecoinAsset?: 'USDT' | 'USDC';
        stablecoinNetwork?: 'TRC20' | 'ERC20' | 'BEP20' | 'SOL' | 'POLYGON';
        walletAddress?: string;
      }
    >({
      query: (body) => ({
        url: '/payout-accounts/setup/otp',
        method: 'POST',
        body,
      }),
    }),
    updatePayoutAccount: builder.mutation<PayoutAccount, { id: string; isDefault: boolean }>({
      query: ({ id, ...body }) => ({ url: `/payout-accounts/${id}`, method: 'PATCH', body }),
      invalidatesTags: ['PayoutAccounts'],
    }),
    createStripePayoutOnboardingLink: builder.mutation<{ onboardingUrl: string }, string>({
      query: (id) => ({ url: `/payout-accounts/${id}/stripe/onboarding-link`, method: 'POST' }),
    }),
    refreshStripePayoutAccountStatus: builder.mutation<PayoutAccount, string>({
      query: (id) => ({ url: `/payout-accounts/${id}/stripe/refresh-status`, method: 'POST' }),
      invalidatesTags: ['PayoutAccounts'],
    }),
    requestPayoutAccountDeleteOtp: builder.mutation<
      { otpRequestId: string; expiresInSeconds: number },
      string
    >({
      query: (id) => ({ url: `/payout-accounts/${id}/delete/otp`, method: 'POST' }),
    }),
    deletePayoutAccount: builder.mutation<
      { deleted: boolean },
      { id: string; otpRequestId: string; code: string }
    >({
      query: ({ id, ...body }) => ({ url: `/payout-accounts/${id}`, method: 'DELETE', body }),
      invalidatesTags: ['PayoutAccounts'],
    }),
    listPaymentMethods: builder.query<
      PaymentMethodCatalogEntry[],
      { countryCode: string; type?: 'BANK' | 'MOBILE_MONEY' }
    >({
      query: (params) => ({ url: '/payment-methods', params }),
      providesTags: ['PaymentMethodCatalog'],
    }),
    listAdminPaymentMethods: builder.query<PaymentMethodCatalogEntry[], void>({
      query: () => '/payment-methods/admin',
      providesTags: ['PaymentMethodCatalog'],
    }),
    createAdminPaymentMethod: builder.mutation<
      PaymentMethodCatalogEntry,
      {
        countryCode: string;
        type: 'BANK' | 'MOBILE_MONEY';
        name: string;
        description?: string;
        bankCode?: string;
        sortOrder?: number;
      }
    >({
      query: (body) => ({ url: '/payment-methods/admin', method: 'POST', body }),
      invalidatesTags: ['PaymentMethodCatalog'],
    }),
    updateAdminPaymentMethod: builder.mutation<
      PaymentMethodCatalogEntry,
      {
        id: string;
        name?: string;
        description?: string;
        bankCode?: string;
        enabled?: boolean;
        sortOrder?: number;
      }
    >({
      query: ({ id, ...body }) => ({ url: `/payment-methods/admin/${id}`, method: 'PATCH', body }),
      invalidatesTags: ['PaymentMethodCatalog'],
    }),
    deleteAdminPaymentMethod: builder.mutation<{ id: string; deleted: boolean }, string>({
      query: (id) => ({ url: `/payment-methods/admin/${id}`, method: 'DELETE' }),
      invalidatesTags: ['PaymentMethodCatalog'],
    }),
    createAdminPaymentMethodLogoUploadUrl: builder.mutation<
      { uploadUrl: string; key: string; bucket: string; expiresInSeconds: number },
      { id: string; contentType: string }
    >({
      query: ({ id, contentType }) => ({
        url: `/payment-methods/admin/${id}/logo/upload-url`,
        method: 'POST',
        body: { contentType },
      }),
    }),
    confirmAdminPaymentMethodLogoUpload: builder.mutation<
      PaymentMethodCatalogEntry,
      { id: string; key: string }
    >({
      query: ({ id, key }) => ({
        url: `/payment-methods/admin/${id}/logo/confirm`,
        method: 'POST',
        body: { key },
      }),
      invalidatesTags: ['PaymentMethodCatalog'],
    }),
    createKycSession: builder.mutation<
      { sessionId: string; url: string; provider: 'didit' | 'self' },
      void
    >({
      query: () => ({ url: '/kyc/session', method: 'POST' }),
      invalidatesTags: ['Kyc', 'Profile'],
    }),
    getKycStatus: builder.query<{ kycStatus: KycStatus; kycVerifiedAt: string | null }, void>({
      query: () => '/kyc/status',
      providesTags: ['Kyc'],
    }),
    cancelMyKyc: builder.mutation<{ cancelled: boolean }, void>({
      query: () => ({ url: '/kyc/cancel', method: 'POST' }),
      invalidatesTags: ['Kyc', 'Profile'],
    }),
    listKycVerifications: builder.query<
      KycVerificationList,
      { status?: KycStatus; search?: string; page?: number; pageSize?: number } | void
    >({
      query: (params) => ({ url: '/admin/kyc', params: params ?? undefined }),
      providesTags: ['Kyc'],
    }),
    getKycVerification: builder.query<KycVerification, string>({
      query: (id) => `/admin/kyc/${id}`,
      providesTags: ['Kyc'],
    }),
    listKycEvidence: builder.query<
      {
        id: string;
        kind: 'DOCUMENT_FRONT' | 'DOCUMENT_BACK' | 'SELFIE_FRAME';
        capturedAt: string;
      }[],
      string
    >({
      query: (id) => `/admin/kyc/${id}/evidence`,
    }),
    getKycEvidenceImage: builder.query<string, { verificationId: string; evidenceId: string }>({
      query: ({ verificationId, evidenceId }) => ({
        url: `/admin/kyc/${verificationId}/evidence/${evidenceId}`,
        responseHandler: (response: Response) => response.blob(),
      }),
      // The blob is only useful as an object URL; this transforms RTK
      // Query's cached response (which would otherwise be the raw Blob) into
      // a URL string components can drop straight into an <img src>.
      // Consumers must revoke it (URL.revokeObjectURL) on unmount/change to
      // avoid leaking blob URLs.
      transformResponse: (blob: Blob) => URL.createObjectURL(blob),
    }),
    getKycDecision: builder.query<
      {
        raw: {
          botFindings?: {
            plausibilityScore: number | null;
            flags: string[];
            summary: string | null;
            extractedFields: {
              fullName: string | null;
              dateOfBirth: string | null;
              documentNumber: string | null;
            } | null;
          } | null;
        } | null;
      },
      string
    >({
      query: (id) => `/admin/kyc/${id}/decision`,
    }),
    refreshKycVerification: builder.mutation<KycVerification, string>({
      query: (id) => ({ url: `/admin/kyc/${id}/refresh`, method: 'POST' }),
      invalidatesTags: ['Kyc'],
    }),
    cancelKycVerification: builder.mutation<KycVerification, string>({
      query: (id) => ({ url: `/admin/kyc/${id}/cancel`, method: 'POST' }),
      invalidatesTags: ['Kyc'],
    }),
    approveKycVerification: builder.mutation<KycVerification, string>({
      query: (id) => ({ url: `/admin/kyc/${id}/approve`, method: 'POST' }),
      invalidatesTags: ['Kyc'],
    }),
    declineKycVerification: builder.mutation<KycVerification, { id: string; reason: string }>({
      query: ({ id, reason }) => ({
        url: `/admin/kyc/${id}/decline`,
        method: 'POST',
        body: { reason },
      }),
      invalidatesTags: ['Kyc'],
    }),
    revokeKycVerification: builder.mutation<KycVerification, { id: string; reason: string }>({
      query: ({ id, reason }) => ({
        url: `/admin/kyc/${id}/revoke`,
        method: 'POST',
        body: { reason },
      }),
      invalidatesTags: ['Kyc'],
    }),
    getTokenomicsStatus: builder.query<TokenomicsStatus, void>({
      query: () => ({ url: '/tokenomics/status' }),
      providesTags: ['Tokenomics'],
    }),
    getValuationHistory: builder.query<ValuationSnapshotRow[], { limit?: number } | void>({
      query: (params) => ({ url: '/valuation/history', params: params ?? undefined }),
      providesTags: ['Tokenomics'],
    }),
    recalculateValuation: builder.mutation<ValuationSnapshotRow, void>({
      query: () => ({ url: '/admin/tokenomics/valuation/recalculate', method: 'POST' }),
      invalidatesTags: ['Tokenomics'],
    }),
    pauseMinting: builder.mutation<{ mintingPaused: boolean }, void>({
      query: () => ({ url: '/admin/tokenomics/pause', method: 'POST' }),
      invalidatesTags: ['Tokenomics'],
    }),
    resumeMinting: builder.mutation<{ mintingPaused: boolean }, void>({
      query: () => ({ url: '/admin/tokenomics/resume', method: 'POST' }),
      invalidatesTags: ['Tokenomics'],
    }),
    burnTokens: builder.mutation<
      unknown,
      { accountCode: string; amount: number; idempotencyKey: string; reason?: string }
    >({
      query: (body) => ({ url: '/admin/tokens/burn', method: 'POST', body }),
      invalidatesTags: ['Tokenomics'],
    }),
    listReserveTransactions: builder.query<
      PaginatedResult<ReserveTransactionRow>,
      {
        page?: number;
        pageSize?: number;
        type?: string;
        status?: string;
        direction?: string;
      } | void
    >({
      query: (params) => ({
        url: '/admin/tokenomics/reserve-transactions',
        params: params ?? undefined,
      }),
      providesTags: ['Tokenomics'],
    }),
    listTokenOperations: builder.query<
      PaginatedResult<TokenOperationRow>,
      { page?: number; pageSize?: number; type?: string; status?: string } | void
    >({
      query: (params) => ({
        url: '/admin/tokenomics/token-operations',
        params: params ?? undefined,
      }),
      providesTags: ['Tokenomics'],
    }),
    getTokenomicsPolicy: builder.query<TokenomicsPolicy, void>({
      query: () => ({ url: '/admin/tokenomics/policy' }),
      providesTags: ['Tokenomics'],
    }),
    updateTokenomicsPolicy: builder.mutation<
      TokenomicsPolicy,
      Partial<{
        valuationIntervalMinutes: number;
        maxIncreaseRate: number;
        maxDecreaseRate: number;
        healthyCoverageThreshold: number;
        watchCoverageThreshold: number;
        restrictedCoverageThreshold: number;
      }>
    >({
      query: (body) => ({ url: '/admin/tokenomics/policy', method: 'POST', body }),
      invalidatesTags: ['Tokenomics'],
    }),
    pinTokenomicsValue: builder.mutation<ValuationSnapshotRow, number>({
      query: (value) => ({ url: '/admin/tokenomics/pin', method: 'POST', body: { value } }),
      invalidatesTags: ['Tokenomics'],
    }),
    unpinTokenomicsValue: builder.mutation<ValuationSnapshotRow, void>({
      query: () => ({ url: '/admin/tokenomics/unpin', method: 'POST' }),
      invalidatesTags: ['Tokenomics'],
    }),
    requestWithdrawalResolveOtp: builder.mutation<
      { otpRequestId: string; expiresInSeconds: number },
      string
    >({
      query: (id) => ({ url: `/admin/withdrawals/${id}/resolve/otp`, method: 'POST' }),
    }),
    approveWithdrawal: builder.mutation<
      { withdrawalId: string; status: string },
      { id: string; otpRequestId?: string; code?: string; adminNote?: string }
    >({
      query: ({ id, ...body }) => ({
        url: `/admin/withdrawals/${id}/approve`,
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Wallet'],
    }),
    submitWithdrawalToNowPayments: builder.mutation<
      { withdrawalId: string; status: string; providerPayoutId?: string },
      {
        id: string;
        otpRequestId?: string;
        code?: string;
        verificationCode?: string;
        adminNote?: string;
      }
    >({
      query: ({ id, ...body }) => ({
        url: `/admin/withdrawals/${id}/submit-nowpayments`,
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Wallet'],
    }),
    verifyWithdrawalPayout: builder.mutation<
      { withdrawalId: string; status: string; providerPayoutId: string },
      { id: string; verificationCode: string }
    >({
      query: ({ id, verificationCode }) => ({
        url: `/admin/withdrawals/${id}/verify-nowpayments`,
        method: 'POST',
        body: { verificationCode },
      }),
      invalidatesTags: ['Wallet'],
    }),
    refreshWithdrawalStatus: builder.mutation<
      { withdrawalId: string; status: string; providerPayoutId: string },
      string
    >({
      query: (id) => ({ url: `/admin/withdrawals/${id}/refresh-nowpayments`, method: 'POST' }),
      invalidatesTags: ['Wallet'],
    }),
    cancelNowPaymentsWithdrawal: builder.mutation<{ withdrawalId: string; status: string }, string>(
      {
        query: (id) => ({ url: `/admin/withdrawals/${id}/cancel-nowpayments`, method: 'POST' }),
        invalidatesTags: ['Wallet'],
      },
    ),
    bulkResolveWithdrawals: builder.mutation<
      { results: { id: string; ok: boolean; error?: string }[] },
      { ids: string[]; action: 'approve' | 'reject'; adminNote?: string }
    >({
      query: (body) => ({ url: '/admin/withdrawals/bulk-resolve', method: 'POST', body }),
      invalidatesTags: ['Wallet'],
    }),
    submitWithdrawalToFlutterwave: builder.mutation<
      { withdrawalId: string; status: string; providerPayoutId?: string },
      { id: string; otpRequestId?: string; code?: string; adminNote?: string }
    >({
      query: ({ id, ...body }) => ({
        url: `/admin/withdrawals/${id}/submit-flutterwave`,
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Wallet'],
    }),
    refreshWithdrawalStatusFlutterwave: builder.mutation<
      { withdrawalId: string; status: string; providerPayoutId: string },
      string
    >({
      query: (id) => ({ url: `/admin/withdrawals/${id}/refresh-flutterwave`, method: 'POST' }),
      invalidatesTags: ['Wallet'],
    }),
    listBanks: builder.query<{ code: string; name: string }[], string>({
      query: (country) => ({ url: `/banks/${country}` }),
    }),
    resolveWithdrawal: builder.mutation<
      { withdrawalId: string; status: string },
      {
        id: string;
        outcome: 'paid' | 'rejected';
        otpRequestId?: string;
        code?: string;
        adminNote?: string;
      }
    >({
      query: ({ id, ...body }) => ({
        url: `/admin/withdrawals/${id}/resolve`,
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Wallet'],
    }),
    getMe: builder.query<PublicUser, void>({
      query: () => '/auth/me',
      providesTags: ['Profile'],
    }),
    updateProfile: builder.mutation<
      PublicUser,
      {
        originCountryId?: string;
        countryId?: string;
        dialectId?: string;
        dialectVariantId?: string;
        firstName?: string;
        lastName?: string;
        gender?: 'MALE' | 'FEMALE';
        emailNotificationsEnabled?: boolean;
        smsNotificationsEnabled?: boolean;
        marketingNotificationsEnabled?: boolean;
        blogNewsNotificationsEnabled?: boolean;
        courseNotificationsEnabled?: boolean;
      }
    >({
      query: (body) => ({
        url: '/auth/me',
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['Profile'],
    }),
    recordPwaInstallation: builder.mutation<{ pwaInstalledAt: string }, void>({
      query: () => ({ url: '/auth/me/pwa-install', method: 'POST' }),
      invalidatesTags: ['Profile'],
    }),
    getNotifications: builder.query<NotificationsPage, { page?: number } | void>({
      query: (params) => ({ url: '/notifications', params: params ?? undefined }),
      providesTags: ['Notifications'],
    }),
    getBannerUpdates: builder.query<{ items: BannerUpdate[] }, void>({
      query: () => '/notifications/banner',
      providesTags: ['Notifications'],
    }),
    markNotificationRead: builder.mutation<{ id: string; read: true }, string>({
      query: (id) => ({ url: `/notifications/${id}/read`, method: 'PATCH' }),
      invalidatesTags: ['Notifications'],
    }),
    markAllNotificationsRead: builder.mutation<{ updated: number }, void>({
      query: () => ({ url: '/notifications/read-all', method: 'POST' }),
      invalidatesTags: ['Notifications'],
    }),
    getAdminSystemUpdates: builder.query<AdminSystemUpdate[], void>({
      query: () => '/notifications/admin/updates',
      providesTags: ['Notifications'],
    }),
    createSystemUpdate: builder.mutation<
      { updateId: string; recipients: number; duplicate: boolean },
      {
        kind: SystemUpdateKind;
        title: string;
        message: string;
        href?: string;
        pushToBanner?: boolean;
      }
    >({
      query: (body) => ({ url: '/notifications/admin/updates', method: 'POST', body }),
      invalidatesTags: ['Notifications'],
    }),
    updateSystemUpdate: builder.mutation<
      AdminSystemUpdate,
      { id: string; title?: string; message?: string; href?: string; pushToBanner?: boolean }
    >({
      query: ({ id, ...body }) => ({
        url: `/notifications/admin/updates/${id}`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['Notifications'],
    }),
    deleteSystemUpdate: builder.mutation<{ id: string; deleted: true }, string>({
      query: (id) => ({ url: `/notifications/admin/updates/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Notifications'],
    }),
    requestPhoneOtp: builder.mutation<
      { otpRequestId: string; expiresInSeconds: number },
      { phoneNumber: string }
    >({
      query: (body) => ({ url: '/auth/phone/otp', method: 'POST', body }),
    }),
    verifyPhone: builder.mutation<
      PublicUser,
      { phoneNumber: string; otpRequestId: string; code: string }
    >({
      query: (body) => ({ url: '/auth/phone/verify', method: 'POST', body }),
      invalidatesTags: ['Profile'],
    }),
    savePhoneUnverified: builder.mutation<PublicUser, { phoneNumber: string }>({
      query: (body) => ({ url: '/auth/phone', method: 'PATCH', body }),
      invalidatesTags: ['Profile'],
    }),
    requestManualPhoneVerification: builder.mutation<
      ManualPhoneVerificationRequestResult,
      { phoneNumber: string }
    >({
      query: (body) => ({ url: '/auth/phone/manual/request', method: 'POST', body }),
      invalidatesTags: ['Profile', 'Wallet'],
    }),
    markManualPhoneVerificationSent: builder.mutation<
      { id: string; status: ManualPhoneVerificationStatus; sentAt: string },
      string
    >({
      query: (id) => ({ url: `/auth/phone/manual/${id}/sent`, method: 'POST' }),
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
    changePassword: builder.mutation<void, { currentPassword: string; newPassword: string }>({
      query: (body) => ({ url: '/auth/change-password', method: 'POST', body }),
    }),
    updateTwoFactor: builder.mutation<PublicUser, { emailEnabled?: boolean; smsEnabled?: boolean }>(
      {
        query: (body) => ({ url: '/auth/me/two-factor', method: 'PATCH', body }),
        invalidatesTags: ['Profile'],
      },
    ),
    requestAccountCloseOtp: builder.mutation<
      { otpRequestId: string; expiresInSeconds: number },
      void
    >({
      query: () => ({ url: '/auth/me/close/otp', method: 'POST' }),
    }),
    closeAccount: builder.mutation<void, { otpRequestId: string; code: string }>({
      query: (body) => ({ url: '/auth/me/close', method: 'POST', body }),
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
    getConnectAdminOverview: builder.query<ConnectAdminOverview, void>({
      query: () => ({ url: '/leads/admin/connect-2026' }),
      providesTags: ['ConnectAdmin'],
    }),
    decideConnectSpeaker: builder.mutation<
      { id: string; speakerStatus: ConnectSpeakerStatus },
      { id: string; decision: 'APPROVE' | 'DECLINE' }
    >({
      query: ({ id, decision }) => ({
        url: `/leads/admin/connect-2026/speakers/${id}/decision`,
        method: 'POST',
        body: { decision },
      }),
      invalidatesTags: ['ConnectAdmin'],
    }),
    resendConnectPhotoLink: builder.mutation<{ sent: boolean; expiresAt: string }, { id: string }>({
      query: ({ id }) => ({
        url: `/leads/admin/connect-2026/speakers/${id}/photo-link`,
        method: 'POST',
      }),
      invalidatesTags: ['ConnectAdmin'],
    }),
    withdrawConnectSpeaker: builder.mutation<
      { withdrawn: boolean; stillAttending: boolean },
      { id: string }
    >({
      query: ({ id }) => ({
        url: `/leads/admin/connect-2026/speakers/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['ConnectAdmin'],
    }),
    deleteConnectRegistration: builder.mutation<
      { deleted: boolean; email: string },
      { id: string }
    >({
      query: ({ id }) => ({
        url: `/leads/admin/connect-2026/registrations/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['ConnectAdmin'],
    }),
    sendConnectReminders: builder.mutation<
      ConnectReminderResult,
      { audience: 'all' | 'speakers'; message?: string }
    >({
      query: (body) => ({ url: '/leads/admin/connect-2026/reminders', method: 'POST', body }),
    }),
    getAdminDataAccessLeads: builder.query<
      DataAccessLeadsPage,
      { page?: number; pageSize?: number } | void
    >({
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
    inviteDataAccessLead: builder.mutation<
      { organizationId: string },
      { id: string; body: DataAccessLeadInviteInput }
    >({
      query: ({ id, body }) => ({
        url: `/leads/admin/data-access/${id}/invite`,
        method: 'POST',
        body,
      }),
      invalidatesTags: ['DataAccessLeads'],
    }),
    deleteDataAccessLead: builder.mutation<{ id: string; status: string }, string>({
      query: (id) => ({
        url: `/leads/admin/data-access/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['DataAccessLeads'],
    }),
    resendDataAccessLeadInvite: builder.mutation<void, string>({
      query: (id) => ({
        url: `/leads/admin/data-access/${id}/resend-invite`,
        method: 'POST',
      }),
    }),
    createSupportRequest: builder.mutation<{ id: string; status: string }, SupportRequestInput>({
      query: (body) => ({
        url: '/leads/support',
        method: 'POST',
        body,
      }),
    }),
    getAdminSupportRequests: builder.query<
      SupportRequestsPage,
      { page?: number; pageSize?: number } | void
    >({
      query: (params) => ({
        url: '/leads/admin/support',
        params: params ?? undefined,
      }),
      providesTags: ['SupportRequests'],
    }),
    updateAdminSupportRequestResolution: builder.mutation<
      AdminSupportRequest,
      { id: string; body: SupportRequestResolutionUpdateInput }
    >({
      query: ({ id, body }) => ({
        url: `/leads/admin/support/${id}/resolution`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['SupportRequests'],
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
    createDistributorAllocation: builder.mutation<
      DistributorAllocation,
      { distributorId: string; tokenAmount: number; discountRate?: number; note?: string }
    >({
      query: ({ distributorId, ...body }) => ({
        url: `/admin/distributors/${distributorId}/allocations`,
        method: 'POST',
        body,
      }),
      invalidatesTags: [
        'DistributorDashboard',
        'DistributorAllocations',
        'DistributorList',
        'DistributorActivity',
        'Wallet',
        'Users',
      ],
    }),
    listDistributorAllocations: builder.query<
      DistributorAllocationsPage,
      { distributorId?: string; page?: number; pageSize?: number } | void
    >({
      query: (params) => ({ url: '/admin/distributors/allocations', params: params ?? undefined }),
      providesTags: ['DistributorAllocations'],
    }),
    listAdminDistributors: builder.query<DistributorAdminSummary[], void>({
      query: () => '/admin/distributors',
      providesTags: ['DistributorList'],
    }),
    getDistributorActivity: builder.query<
      DistributorActivityPage,
      { distributorId: string; page?: number; pageSize?: number }
    >({
      query: ({ distributorId, ...params }) => ({
        url: `/admin/distributors/${distributorId}/activity`,
        params,
      }),
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
      query: (userId) => ({
        url: `/distributors/sub-distributors/${userId}/promote`,
        method: 'POST',
      }),
      invalidatesTags: ['SubDistributorList', 'DistributorDashboard'],
    }),
    listSubDistributors: builder.query<SubDistributorSummary[], void>({
      query: () => '/distributors/sub-distributors',
      providesTags: ['SubDistributorList'],
    }),
    createSubDistributorAllocation: builder.mutation<
      DistributorAllocation,
      { subDistributorId: string; tokenAmount: number; discountRate?: number; note?: string }
    >({
      query: ({ subDistributorId, ...body }) => ({
        url: `/distributors/sub-distributors/${subDistributorId}/allocations`,
        method: 'POST',
        body,
      }),
      invalidatesTags: ['SubDistributorList', 'SubDistributorActivity', 'DistributorDashboard'],
    }),
    getSubDistributorActivity: builder.query<
      DistributorActivityPage,
      { subDistributorId: string; page?: number; pageSize?: number }
    >({
      query: ({ subDistributorId, ...params }) => ({
        url: `/distributors/sub-distributors/${subDistributorId}/activity`,
        params,
      }),
      providesTags: ['SubDistributorActivity'],
    }),
    updateSubDistributorStatus: builder.mutation<
      { id: string; status: string },
      { id: string; status: string }
    >({
      query: ({ id, status }) => ({
        url: `/distributors/sub-distributors/${id}/status`,
        method: 'PATCH',
        body: { status },
      }),
      invalidatesTags: ['SubDistributorList'],
    }),
    requestSubDistributorAdjustmentOtp: builder.mutation<
      { otpRequestId: string; expiresInSeconds: number },
      { id: string; amount: number; reference: string }
    >({
      query: ({ id, ...body }) => ({
        url: `/distributors/sub-distributors/${id}/adjustments/otp`,
        method: 'POST',
        body,
      }),
    }),
    adjustSubDistributorWallet: builder.mutation<
      SubDistributorAdjustment,
      { id: string; amount: number; reference: string; otpRequestId?: string; code?: string }
    >({
      query: ({ id, ...body }) => ({
        url: `/distributors/sub-distributors/${id}/adjustments`,
        method: 'POST',
        body,
      }),
      invalidatesTags: ['SubDistributorList', 'SubDistributorActivity'],
    }),
    getAdminStats: builder.query<AdminStats, void>({
      query: () => '/admin/stats',
    }),
    getAdminLeaderboard: builder.query<AdminLeaderboard, void>({
      query: () => '/admin/leaderboard',
    }),
    getAdminLeaderboardEarners: builder.query<
      LeaderboardPage<LeaderboardEarnerRow>,
      { page: number; pageSize: number }
    >({
      query: ({ page, pageSize }) => ({
        url: '/admin/leaderboard/earners',
        params: { page, pageSize },
      }),
    }),
    getAdminLeaderboardContributors: builder.query<
      LeaderboardPage<LeaderboardContributorRow>,
      { page: number; pageSize: number }
    >({
      query: ({ page, pageSize }) => ({
        url: '/admin/leaderboard/contributors',
        params: { page, pageSize },
      }),
    }),
    getProofAccountReport: builder.query<ProofAccountReportResponse, string>({
      query: (userId) => `/admin/users/${userId}/proof-report`,
    }),
    // Fetched as a blob (not a plain query URL) so the request carries the
    // same bearer Authorization header every other admin call does -- a
    // plain <a href> download would hit this JwtAuthGuard-protected route
    // with no credentials at all. Consumers must revoke the returned object
    // URL (URL.revokeObjectURL) once the download has been triggered.
    getProofAccountReportPdfUrl: builder.query<string, string>({
      query: (userId) => ({
        url: `/admin/users/${userId}/proof-report/pdf`,
        responseHandler: (response: Response) => response.blob(),
      }),
      transformResponse: (blob: Blob) => URL.createObjectURL(blob),
    }),
    sendProofAccountReport: builder.mutation<{ sent: boolean }, string>({
      query: (userId) => ({ url: `/admin/users/${userId}/proof-report/send`, method: 'POST' }),
    }),
    getMyProofAccountReport: builder.query<MyProofAccountReportResponse, void>({
      query: () => '/wallet/proof-report',
    }),
    // Same authenticated-blob pattern as getProofAccountReportPdfUrl above,
    // just against the trainer's own gated endpoint instead of the admin one.
    getMyProofAccountReportPdfUrl: builder.query<string, void>({
      query: () => ({
        url: '/wallet/proof-report/pdf',
        responseHandler: (response: Response) => response.blob(),
      }),
      transformResponse: (blob: Blob) => URL.createObjectURL(blob),
    }),
    getAdminP2PSettings: builder.query<P2PMarketSettings, void>({
      query: () => '/p2p/admin/settings',
      providesTags: ['P2P'],
    }),
    updateAdminP2PSettings: builder.mutation<P2PMarketSettings, Partial<P2PMarketSettings>>({
      query: (body) => ({ url: '/p2p/admin/settings', method: 'PATCH', body }),
      invalidatesTags: ['P2P'],
    }),
    listAdminIntegrations: builder.query<AdminIntegration[], void>({
      query: () => '/integrations/admin',
      providesTags: ['Integrations'],
    }),
    // No create endpoint -- an integration is created by implementing it in
    // code (see services/api/src/integrations/integration-registry.ts),
    // which syncs into this list automatically. Admin only gates an
    // existing row via updateAdminIntegration below.
    updateAdminIntegration: builder.mutation<
      AdminIntegration,
      {
        id: string;
        enabled?: boolean;
        feeTokenAmount?: number;
        maxConcurrentClaims?: number;
        codeValidityMinutes?: number;
        consensusCount?: number;
        sortOrder?: number;
        requirePhoneVerified?: boolean;
        requireKycApproved?: boolean;
        minCompletedTasks?: number;
      }
    >({
      query: ({ id, ...body }) => ({ url: `/integrations/admin/${id}`, method: 'PATCH', body }),
      invalidatesTags: ['Integrations'],
    }),
    listAdminP2PTrades: builder.query<P2PTrade[], { status?: P2PTradeStatus } | void>({
      query: (params) => ({ url: '/p2p/admin/trades', params: params ?? undefined }),
      providesTags: ['P2P'],
    }),
    listAdminP2PDisputes: builder.query<P2PDispute[], { status?: P2PDisputeStatus } | void>({
      query: (params) => ({ url: '/p2p/admin/disputes', params: params ?? undefined }),
      providesTags: ['P2P'],
    }),
    requestP2PForceResolveOtp: builder.mutation<
      { otpRequestId: string; destination?: string; channel?: string },
      { id: string; outcome: 'refund-seller' | 'release-buyer' }
    >({
      query: ({ id, outcome }) => ({
        url: `/p2p/admin/trades/${id}/force-resolve-otp`,
        method: 'POST',
        body: { outcome },
      }),
    }),
    // Breaks the deadlock on a trade marked paid but never released, with
    // no dispute -- the escrow is frozen and neither party has a control
    // that moves it. Invalidates Wallet as well as P2P because the escrow
    // actually moves.
    forceResolveP2PTrade: builder.mutation<
      P2PTrade,
      {
        id: string;
        outcome: 'refund-seller' | 'release-buyer';
        reason: string;
        otpRequestId?: string;
        code?: string;
      }
    >({
      query: ({ id, ...body }) => ({
        url: `/p2p/admin/trades/${id}/force-resolve`,
        method: 'POST',
        body,
      }),
      invalidatesTags: ['P2P', 'Wallet'],
    }),
    resolveP2PDispute: builder.mutation<
      P2PDispute,
      { id: string; winner: 'buyer' | 'seller'; resolutionNote?: string }
    >({
      query: ({ id, winner, resolutionNote }) => ({
        url: `/p2p/admin/disputes/${id}/resolve`,
        method: 'POST',
        body: { winner, resolutionNote },
      }),
      invalidatesTags: ['P2P', 'Wallet'],
    }),
    getUsers: builder.query<
      PublicUser[],
      { role?: string; status?: string; search?: string } | void
    >({
      query: (params) => ({
        url: '/auth/admin/users',
        params: params ?? undefined,
      }),
      providesTags: ['Users'],
    }),
    getAuditHoldQueue: builder.query<PublicUser[], void>({
      query: () => '/auth/admin/users/audit-hold-queue',
      providesTags: ['Users'],
    }),
    listAdminManualPhoneVerifications: builder.query<
      ManualPhoneVerificationPage,
      {
        status?: ManualPhoneVerificationStatus;
        page?: number;
        pageSize?: number;
        search?: string;
        sortBy?: 'user' | 'phone' | 'status' | 'sentAt' | 'createdAt';
        sortOrder?: 'asc' | 'desc';
      } | void
    >({
      query: (params) => ({ url: '/auth/admin/phone-verifications', params: params ?? undefined }),
      providesTags: ['Users'],
    }),
    verifyAdminManualPhoneVerification: builder.mutation<
      ManualPhoneVerificationRow,
      { id: string; code: string }
    >({
      query: ({ id, code }) => ({
        url: `/auth/admin/phone-verifications/${id}/verify`,
        method: 'POST',
        body: { code },
      }),
      invalidatesTags: ['Users'],
    }),
    confirmAdminManualPhoneVerification: builder.mutation<ManualPhoneVerificationRow, string>({
      query: (id) => ({ url: `/auth/admin/phone-verifications/${id}/confirm`, method: 'POST' }),
      invalidatesTags: ['Users'],
    }),
    rejectAdminManualPhoneVerification: builder.mutation<ManualPhoneVerificationRow, string>({
      query: (id) => ({ url: `/auth/admin/phone-verifications/${id}/reject`, method: 'POST' }),
      invalidatesTags: ['Users'],
    }),
    // Admin oversight of the peer WhatsApp Validator flow -- who requested,
    // who claimed, and current status platform-wide. Separate from the
    // requester/validator-facing WhatsAppValidator endpoints above.
    listAdminWhatsAppValidations: builder.query<
      AdminWhatsAppValidationPage,
      {
        status?: WhatsAppValidationRequestStatus;
        page?: number;
        pageSize?: number;
        search?: string;
        sortBy?: 'requester' | 'claimant' | 'phone' | 'status' | 'createdAt';
        sortOrder?: 'asc' | 'desc';
      } | void
    >({
      query: (params) => ({
        url: '/admin/whatsapp-validator/requests',
        params: params ?? undefined,
      }),
      providesTags: ['WhatsAppValidator'],
    }),
    verifyAdminWhatsAppValidation: builder.mutation<
      AdminWhatsAppValidationRow,
      { id: string; code: string }
    >({
      query: ({ id, code }) => ({
        url: `/admin/whatsapp-validator/requests/${id}/verify`,
        method: 'POST',
        body: { code },
      }),
      invalidatesTags: ['WhatsAppValidator'],
    }),
    forceVerifyAdminWhatsAppValidation: builder.mutation<AdminWhatsAppValidationRow, string>({
      query: (id) => ({
        url: `/admin/whatsapp-validator/requests/${id}/force-verify`,
        method: 'POST',
      }),
      invalidatesTags: ['WhatsAppValidator'],
    }),
    rejectAdminWhatsAppValidation: builder.mutation<AdminWhatsAppValidationRow, string>({
      query: (id) => ({ url: `/admin/whatsapp-validator/requests/${id}/reject`, method: 'POST' }),
      invalidatesTags: ['WhatsAppValidator'],
    }),
    listAdminSmsContacts: builder.query<
      AdminSmsContactsPage,
      { page?: number; pageSize?: number; search?: string } | void
    >({
      query: (params) => ({ url: '/admin/sms/contacts', params: params ?? undefined }),
      providesTags: ['AdminSms'],
    }),
    listAdminSmsMessages: builder.query<
      AdminSmsMessagesPage,
      { contactId: string; page?: number; pageSize?: number }
    >({
      query: ({ contactId, ...params }) => ({
        url: `/admin/sms/contacts/${contactId}/messages`,
        params,
      }),
      providesTags: ['AdminSms'],
    }),
    sendAdminSms: builder.mutation<
      { id: string; status: 'SENT'; provider: string; createdAt: string },
      { recipientId: string; message: string; provider?: SmsProviderKey }
    >({
      query: (body) => ({ url: '/admin/sms/send', method: 'POST', body }),
      invalidatesTags: ['AdminSms'],
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
    updateTrainerRating: builder.mutation<PublicUser, { id: string; rating: TrainerRating }>({
      query: ({ id, rating }) => ({
        url: `/auth/admin/users/${id}/trainer-rating`,
        method: 'PATCH',
        body: { rating },
      }),
      invalidatesTags: (_result, _error, { id }) => ['Users', { type: 'Users', id }],
    }),
    updateValidatorLevel: builder.mutation<
      PublicUser,
      { id: string; validatorLevel: 'L1' | 'L2' | 'L3' }
    >({
      query: ({ id, validatorLevel }) => ({
        url: `/auth/admin/users/${id}/validator-level`,
        method: 'PATCH',
        body: { validatorLevel },
      }),
      invalidatesTags: (_result, _error, { id }) => ['Users', { type: 'Users', id }],
    }),
    getValidatorDialectAssignments: builder.query<ValidatorDialectAssignment[], string>({
      query: (id) => `/auth/admin/users/${id}/validator-dialects`,
      providesTags: (_result, _error, id) => [{ type: 'ValidatorDialectAssignments', id }],
    }),
    assignValidatorDialect: builder.mutation<
      ValidatorDialectAssignment[],
      { id: string; dialectId: string }
    >({
      query: ({ id, dialectId }) => ({
        url: `/auth/admin/users/${id}/validator-dialects`,
        method: 'POST',
        body: { dialectId },
      }),
      invalidatesTags: (_result, _error, { id }) => [{ type: 'ValidatorDialectAssignments', id }],
    }),
    unassignValidatorDialect: builder.mutation<
      ValidatorDialectAssignment[],
      { id: string; dialectId: string }
    >({
      query: ({ id, dialectId }) => ({
        url: `/auth/admin/users/${id}/validator-dialects/${dialectId}`,
        method: 'DELETE',
      }),
      invalidatesTags: (_result, _error, { id }) => [{ type: 'ValidatorDialectAssignments', id }],
    }),
    getAdminUser: builder.query<PublicUser, string>({
      query: (id) => `/auth/admin/users/${id}`,
      providesTags: (_result, _error, id) => [{ type: 'Users', id }],
    }),
    resetUserDialect: builder.mutation<PublicUser, string>({
      query: (id) => ({ url: `/auth/admin/users/${id}/dialect/reset`, method: 'POST' }),
      invalidatesTags: (_result, _error, id) => ['Users', { type: 'Users', id }],
    }),
    getUserActivity: builder.query<
      UserActivityPage,
      { userId: string; page?: number; pageSize?: number }
    >({
      query: ({ userId, ...params }) => ({ url: `/auth/admin/users/${userId}/activity`, params }),
      providesTags: (_result, _error, { userId }) => [{ type: 'Users', id: `${userId}-activity` }],
    }),
    requestUserLockOtp: builder.mutation<
      { otpRequestId: string; expiresInSeconds: number },
      { id: string; status: string }
    >({
      query: ({ id, status }) => ({
        url: `/auth/admin/users/${id}/lock/otp`,
        method: 'POST',
        body: { status },
      }),
    }),
    lockUser: builder.mutation<
      PublicUser,
      { id: string; status: string; otpRequestId?: string; code?: string }
    >({
      query: ({ id, ...body }) => ({ url: `/auth/admin/users/${id}/lock`, method: 'POST', body }),
      invalidatesTags: (_result, _error, { id }) => ['Users', { type: 'Users', id }],
    }),
    requestUserDeleteOtp: builder.mutation<
      { otpRequestId: string; expiresInSeconds: number },
      string
    >({
      query: (id) => ({ url: `/auth/admin/users/${id}/delete/otp`, method: 'POST' }),
    }),
    requestAuditHoldReleaseOtp: builder.mutation<
      { otpRequestId: string; expiresInSeconds: number },
      string
    >({
      query: (id) => ({ url: `/auth/admin/users/${id}/audit-hold/release/otp`, method: 'POST' }),
    }),
    releaseAuditHold: builder.mutation<
      PublicUser,
      { id: string; otpRequestId?: string; code?: string }
    >({
      query: ({ id, ...body }) => ({
        url: `/auth/admin/users/${id}/audit-hold/release`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (_result, _error, { id }) => ['Users', { type: 'Users', id }],
    }),
    requestRevokePhoneOtp: builder.mutation<
      { otpRequestId: string; expiresInSeconds: number },
      string
    >({
      query: (id) => ({ url: `/auth/admin/users/${id}/phone/revoke/otp`, method: 'POST' }),
    }),
    revokePhoneVerification: builder.mutation<
      PublicUser,
      { id: string; otpRequestId?: string; code?: string }
    >({
      query: ({ id, ...body }) => ({
        url: `/auth/admin/users/${id}/phone/revoke`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (_result, _error, { id }) => ['Users', { type: 'Users', id }],
    }),
    sendInstantTrainerReport: builder.mutation<{ sent: boolean }, string>({
      query: (id) => ({ url: `/admin/users/${id}/send-report`, method: 'POST' }),
    }),
    deleteUser: builder.mutation<
      { id: string; deleted: boolean },
      { id: string; otpRequestId?: string; code?: string }
    >({
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
      {
        userId: string;
        tokenAmount: number;
        reference: string;
        otpRequestId?: string;
        code?: string;
      }
    >({
      query: (body) => ({
        url: '/admin/training-payouts',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Wallet', 'Users'],
    }),
    requestAdminWalletAdjustmentOtp: builder.mutation<
      { otpRequestId: string; expiresInSeconds: number },
      { userId: string; tokenAmount: number; reference: string }
    >({
      query: (body) => ({ url: '/admin/wallet-adjustments/otp', method: 'POST', body }),
    }),
    createAdminWalletAdjustment: builder.mutation<
      { userId: string; reference: string; amount: string; balance: string },
      {
        userId: string;
        tokenAmount: number;
        reference: string;
        otpRequestId?: string;
        code?: string;
      }
    >({
      query: (body) => ({ url: '/admin/wallet-adjustments', method: 'POST', body }),
      invalidatesTags: ['Wallet', 'Users'],
    }),
    getAdminTrainerRecordings: builder.query<
      AdminRecordingsPage,
      { trainerId: string; page: number; pageSize: number }
    >({
      query: ({ trainerId, page, pageSize }) => ({
        url: `/admin-recordings/trainers/${trainerId}`,
        params: { page, pageSize },
      }),
      providesTags: (_result, _error, { trainerId }) => [
        { type: 'AdminRecordings', id: trainerId },
      ],
    }),
    getAdminAllRecordings: builder.query<AdminRecordingsPage, ListAllRecordingsParams>({
      query: (params) => ({ url: '/admin-recordings', params }),
      providesTags: ['AdminRecordings'],
    }),
    getAsrCoverage: builder.query<AsrCoverageRow[], void>({
      query: () => ({ url: '/admin-recordings/asr-coverage' }),
      providesTags: ['AdminRecordings'],
    }),
    setAsrBackfill: builder.mutation<
      { dialectTag: string; backfillEnabled: boolean },
      { dialectTag: string; enabled: boolean }
    >({
      query: ({ dialectTag, enabled }) => ({
        url: `/admin-recordings/asr-coverage/${dialectTag}/backfill`,
        method: 'POST',
        body: { enabled },
      }),
      invalidatesTags: ['AdminRecordings'],
    }),
    getUnsettled: builder.query<UnsettledPage, { page: number; pageSize: number; userId?: string }>(
      {
        query: (params) => ({ url: '/admin-settlement/unsettled', params }),
        providesTags: ['AdminSettlement'],
      },
    ),
    settleOne: builder.mutation<SettleResult, { id: string; force?: boolean }>({
      query: ({ id, force }) => ({
        url: `/admin-settlement/${id}/settle`,
        method: 'POST',
        body: { force },
      }),
      invalidatesTags: ['AdminSettlement', 'Wallet', 'Tokenomics'],
    }),
    settleAll: builder.mutation<SettleAllResult, { force?: boolean }>({
      query: (body) => ({ url: '/admin-settlement/settle-all', method: 'POST', body }),
      invalidatesTags: ['AdminSettlement', 'Wallet', 'Tokenomics'],
    }),
    requestRecordingAuditClawbackOtp: builder.mutation<
      { otpRequestId: string; expiresInSeconds: number },
      { id: string }
    >({
      query: ({ id }) => ({
        url: `/admin-recordings/${id}/audit/otp`,
        method: 'POST',
      }),
    }),
    auditRecording: builder.mutation<
      AuditRecordingResult,
      {
        id: string;
        status: AdminAuditStatus;
        clawback?: boolean;
        otpRequestId?: string;
        code?: string;
        trainerId?: string;
      }
    >({
      query: ({ id, trainerId: _trainerId, ...body }) => ({
        url: `/admin-recordings/${id}/audit`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (_result, _error, { trainerId }) =>
        trainerId
          ? [{ type: 'AdminRecordings', id: trainerId }, 'AdminRecordings', 'Wallet', 'Users']
          : ['AdminRecordings', 'Wallet', 'Users'],
    }),
    getAudioRetentionRules: builder.query<AudioRetentionRule[], void>({
      query: () => '/admin/dataset-storage/rules',
      providesTags: ['AudioRetentionRules'],
    }),
    createAudioRetentionRule: builder.mutation<AudioRetentionRule, AudioRetentionRuleInput>({
      query: (body) => ({ url: '/admin/dataset-storage/rules', method: 'POST', body }),
      invalidatesTags: ['AudioRetentionRules'],
    }),
    updateAudioRetentionRule: builder.mutation<
      AudioRetentionRule,
      { id: string; body: Partial<AudioRetentionRuleInput> }
    >({
      query: ({ id, body }) => ({
        url: `/admin/dataset-storage/rules/${id}`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['AudioRetentionRules'],
    }),
    deleteAudioRetentionRule: builder.mutation<{ id: string }, string>({
      query: (id) => ({ url: `/admin/dataset-storage/rules/${id}`, method: 'DELETE' }),
      invalidatesTags: ['AudioRetentionRules'],
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
    refreshExchangeRatesNow: builder.mutation<
      { updated: number; skipped: number; total: number },
      void
    >({
      query: () => ({ url: '/geo/admin/countries/refresh-exchange-rates', method: 'POST' }),
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
      query: (id) => ({
        url: `/geo/admin/dialects/${id}/generate-keyboard-layout`,
        method: 'POST',
      }),
    }),
    getAdminDialectVariants: builder.query<AdminDialectVariant[], string>({
      query: (dialectId) => `/geo/admin/dialects/${dialectId}/variants`,
      providesTags: (_result, _error, dialectId) => [
        { type: 'AdminDialects', id: `${dialectId}-variants` },
      ],
    }),
    getAllAdminDialectVariants: builder.query<AdminDialectVariantFlat[], void>({
      query: () => '/geo/admin/dialect-variants',
      providesTags: ['AdminDialects'],
    }),
    createDialectVariant: builder.mutation<
      AdminDialectVariant,
      { dialectId: string; body: DialectVariantInput }
    >({
      query: ({ dialectId, body }) => ({
        url: `/geo/admin/dialects/${dialectId}/variants`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (_result, _error, { dialectId }) => [
        { type: 'AdminDialects', id: `${dialectId}-variants` },
        'AdminDialects',
      ],
    }),
    updateDialectVariant: builder.mutation<
      AdminDialectVariant,
      { id: string; dialectId: string; body: Partial<DialectVariantInput> }
    >({
      query: ({ id, body }) => ({
        url: `/geo/admin/dialect-variants/${id}`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: (_result, _error, { dialectId }) => [
        { type: 'AdminDialects', id: `${dialectId}-variants` },
        'AdminDialects',
      ],
    }),
    deleteDialectVariant: builder.mutation<
      { id: string; deleted: boolean },
      { id: string; dialectId: string }
    >({
      query: ({ id }) => ({ url: `/geo/admin/dialect-variants/${id}`, method: 'DELETE' }),
      invalidatesTags: (_result, _error, { dialectId }) => [
        { type: 'AdminDialects', id: `${dialectId}-variants` },
        'AdminDialects',
      ],
    }),
    getPlatformSettings: builder.query<PlatformSettings, void>({
      query: () => '/admin/platform-settings',
      providesTags: ['PlatformSettings'],
    }),
    getPublicClientSettings: builder.query<PublicClientSettings, void>({
      query: () => '/settings/public',
    }),
    getPublicSubscriptionPlans: builder.query<PublicSubscriptionPlan[], void>({
      query: () => '/voice-stream/subscription-plans/public',
    }),
    chatWithAssistant: builder.mutation<
      { message: string; persistent: boolean },
      { message: string; history: Array<{ role: 'user' | 'assistant'; content: string }> }
    >({
      query: (body) => ({ url: '/assistant/chat', method: 'POST', body }),
      invalidatesTags: ['AssistantThread'],
    }),
    getAssistantThread: builder.query<
      {
        persistent: boolean;
        messages: Array<{
          id: string;
          role: 'user' | 'assistant';
          content: string;
          createdAt: string;
        }>;
      },
      void
    >({
      query: () => '/assistant/thread',
      providesTags: ['AssistantThread'],
    }),
    getAdminAssistantConversations: builder.query<
      AdminAssistantConversationPage,
      { page: number; pageSize: number; search?: string }
    >({
      query: ({ page, pageSize, search }) => ({
        url: '/assistant/admin/conversations',
        params: { page, pageSize, search },
      }),
      providesTags: ['AdminAssistantConversations'],
    }),
    getAdminAssistantConversation: builder.query<AdminAssistantConversationDetail, string>({
      query: (conversationId) => `/assistant/admin/conversations/${conversationId}`,
      providesTags: (_result, _error, id) => [{ type: 'AdminAssistantConversations', id }],
    }),
    createAdminAssistantGithubIssue: builder.mutation<
      { created: boolean; issueNumber: number; issueUrl: string; createdAt: string },
      { conversationId: string; messageId: string; title?: string; body?: string }
    >({
      query: ({ messageId, title, body }) => ({
        url: `/assistant/admin/messages/${messageId}/github-issue`,
        method: 'POST',
        body: { title, body },
      }),
      invalidatesTags: (_result, _error, input) => [
        { type: 'AdminAssistantConversations', id: input.conversationId },
      ],
    }),
    getAdminFaqs: builder.query<AdminFaq[], void>({
      query: () => '/admin/faqs',
      providesTags: ['Faqs'],
    }),
    createFaq: builder.mutation<AdminFaq, FaqInput>({
      query: (body) => ({ url: '/admin/faqs', method: 'POST', body }),
      invalidatesTags: (_result, _error, body) =>
        body.sourceMessageId ? ['Faqs', 'AdminAssistantConversations'] : ['Faqs'],
    }),
    updateFaq: builder.mutation<
      AdminFaq,
      { id: string; body: Partial<FaqInput> & { visible?: boolean } }
    >({
      query: ({ id, body }) => ({ url: `/admin/faqs/${id}`, method: 'PATCH', body }),
      invalidatesTags: ['Faqs'],
    }),
    deleteFaq: builder.mutation<{ id: string; deleted: boolean }, string>({
      query: (id) => ({ url: `/admin/faqs/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Faqs'],
    }),
    updatePlatformSettings: builder.mutation<PlatformSettings, PlatformSettingsInput>({
      query: (body) => ({
        url: '/admin/platform-settings',
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['PlatformSettings'],
    }),
    // Admin-only presigned upload for the top banner image -- browser PUTs
    // the raw file bytes directly to `uploadUrl`, then the caller saves
    // {bucket, key} via updatePlatformSettings, same two-step flow as
    // every other image upload in this app (blog, course, marketing, DYK).
    uploadTopBannerImage: builder.mutation<
      { uploadUrl: string; key: string; bucket: string },
      { contentType: string }
    >({
      query: (body) => ({
        url: '/admin/platform-settings/top-banner/upload-url',
        method: 'POST',
        body,
      }),
    }),
    uploadConnectHeroImage: builder.mutation<
      { uploadUrl: string; key: string; bucket: string },
      { contentType: string }
    >({
      query: (body) => ({
        url: '/admin/platform-settings/connect-hero/upload-url',
        method: 'POST',
        body,
      }),
    }),
    getApiAccessTokens: builder.query<ApiAccessTokenSummary[], void>({
      query: () => '/admin/api-access-tokens',
      providesTags: ['ApiAccessTokens'],
    }),
    setApiAccessToken: builder.mutation<ApiAccessTokenSummary, { key: string; value: string }>({
      query: ({ key, value }) => ({
        url: `/admin/api-access-tokens/${key}`,
        method: 'PUT',
        body: { value },
      }),
      invalidatesTags: ['ApiAccessTokens'],
    }),
    deleteApiAccessToken: builder.mutation<{ removed: boolean }, string>({
      query: (key) => ({ url: `/admin/api-access-tokens/${key}`, method: 'DELETE' }),
      invalidatesTags: ['ApiAccessTokens'],
    }),
    getSubscriptionPlans: builder.query<SubscriptionPlan[], void>({
      query: () => '/admin/voice-stream/subscription-plans',
      providesTags: ['SubscriptionPlans'],
    }),
    upsertSubscriptionPlan: builder.mutation<
      SubscriptionPlan,
      { key: string; data: SubscriptionPlanInput }
    >({
      query: ({ key, data }) => ({
        url: `/admin/voice-stream/subscription-plans/${key}`,
        method: 'PUT',
        body: data,
      }),
      invalidatesTags: ['SubscriptionPlans'],
    }),
    deleteSubscriptionPlan: builder.mutation<{ removed: boolean }, string>({
      query: (key) => ({ url: `/admin/voice-stream/subscription-plans/${key}`, method: 'DELETE' }),
      invalidatesTags: ['SubscriptionPlans'],
    }),
    getAdminWords: builder.query<
      AdminWordsPage,
      {
        page: number;
        pageSize: number;
        search?: string;
        partOfSpeech?: PartOfSpeech;
        disabled?: boolean;
      }
    >({
      query: ({ page, pageSize, search, partOfSpeech, disabled }) => ({
        url: '/words/admin',
        params: { page, pageSize, search, partOfSpeech, disabled },
      }),
      providesTags: ['AdminWords'],
    }),
    deleteWord: builder.mutation<{ id: string; deleted: boolean }, string>({
      query: (id) => ({ url: `/words/admin/${id}`, method: 'DELETE' }),
      invalidatesTags: ['AdminWords'],
    }),
    setWordDisabled: builder.mutation<
      { id: string; isDisabled: boolean },
      { id: string; disabled: boolean }
    >({
      query: ({ id, disabled }) => ({
        url: `/words/admin/${id}/disable`,
        method: 'PATCH',
        body: { disabled },
      }),
      invalidatesTags: ['AdminWords'],
    }),
    bulkDeleteWords: builder.mutation<
      { deleted: number; skipped: number },
      { ids: string[] } | { search?: string; partOfSpeech?: PartOfSpeech; disabled?: boolean }
    >({
      query: (body) => ({ url: '/words/admin', method: 'DELETE', body }),
      invalidatesTags: ['AdminWords'],
    }),
    bulkSetWordsDisabled: builder.mutation<
      { updated: number },
      | { ids: string[]; setDisabled: boolean }
      | { setDisabled: boolean; search?: string; partOfSpeech?: PartOfSpeech; disabled?: boolean }
    >({
      query: (body) => ({ url: '/words/admin', method: 'PATCH', body }),
      invalidatesTags: ['AdminWords'],
    }),
    getAdminSentences: builder.query<
      AdminSentencesPage,
      { page: number; pageSize: number; search?: string; disabled?: boolean }
    >({
      query: ({ page, pageSize, search, disabled }) => ({
        url: '/sentences/admin',
        params: { page, pageSize, search, disabled },
      }),
      providesTags: ['AdminSentences'],
    }),
    deleteSentence: builder.mutation<{ id: string; deleted: boolean }, string>({
      query: (id) => ({ url: `/sentences/admin/${id}`, method: 'DELETE' }),
      invalidatesTags: ['AdminSentences'],
    }),
    setSentenceDisabled: builder.mutation<
      { id: string; isDisabled: boolean },
      { id: string; disabled: boolean }
    >({
      query: ({ id, disabled }) => ({
        url: `/sentences/admin/${id}/disable`,
        method: 'PATCH',
        body: { disabled },
      }),
      invalidatesTags: ['AdminSentences'],
    }),
    bulkDeleteSentences: builder.mutation<
      { deleted: number; skipped: number },
      { ids: string[] } | { search?: string; disabled?: boolean }
    >({
      query: (body) => ({ url: '/sentences/admin', method: 'DELETE', body }),
      invalidatesTags: ['AdminSentences'],
    }),
    bulkSetSentencesDisabled: builder.mutation<
      { updated: number },
      | { ids: string[]; setDisabled: boolean }
      | { setDisabled: boolean; search?: string; disabled?: boolean }
    >({
      query: (body) => ({ url: '/sentences/admin', method: 'PATCH', body }),
      invalidatesTags: ['AdminSentences'],
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
    reorderBlogPosts: builder.mutation<
      { reordered: number },
      { items: { id: string; sortOrder: number }[] }
    >({
      query: (body) => ({ url: '/blog/admin/posts/reorder', method: 'PATCH', body }),
      invalidatesTags: ['BlogPosts'],
    }),
    createBlogMediaUpload: builder.mutation<
      BlogMediaUpload,
      { fileName: string; contentType: string; kind: 'IMAGE' | 'VIDEO' }
    >({
      query: (body) => ({ url: '/blog/admin/media/upload-url', method: 'POST', body }),
    }),
    getAdminCourses: builder.query<AdminCourseListItem[], void>({
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
    reorderCourses: builder.mutation<
      { reordered: number },
      { items: { id: string; sortOrder: number }[] }
    >({
      query: (body) => ({ url: '/courses/admin/courses/reorder', method: 'PATCH', body }),
      invalidatesTags: ['Courses'],
    }),
    createCourseMediaUpload: builder.mutation<
      CourseMediaUpload,
      { fileName: string; contentType: string; kind: 'IMAGE' | 'AUDIO' }
    >({
      query: (body) => ({ url: '/courses/admin/media/upload-url', method: 'POST', body }),
    }),
    getCourseToStudy: builder.query<CourseStudy, string>({
      query: (slug) => `/courses/study/${slug}`,
      providesTags: (_result, _error, slug) => [{ type: 'Courses', id: slug }],
    }),
    saveCourseProgress: builder.mutation<
      CourseProgress,
      { slug: string; lastSlideIndex: number; totalSlides: number }
    >({
      query: ({ slug, ...body }) => ({
        url: `/courses/study/${slug}/progress`,
        method: 'PUT',
        body,
      }),
      // Completing a required course changes whether the trainer is still
      // gated from training -- refetch that check right after saving.
      invalidatesTags: ['RequiredCourses'],
    }),
    getIncompleteRequiredCourses: builder.query<IncompleteRequiredCourse[], void>({
      query: () => '/courses/study/required/incomplete',
      providesTags: ['RequiredCourses'],
    }),
    getSuggestedCourses: builder.query<SuggestedCourse[], void>({
      query: () => '/courses/study/suggested',
      providesTags: ['RequiredCourses'],
    }),
    dismissSuggestedCourse: builder.mutation<{ dismissed: boolean }, string>({
      query: (slug) => ({ url: `/courses/study/suggested/${slug}/dismiss`, method: 'POST' }),
      invalidatesTags: ['RequiredCourses'],
    }),
    createValidatorDeck: builder.mutation<ValidatorDeckSummary, CreateValidatorDeckInput>({
      query: (body) => ({ url: '/validator/decks', method: 'POST', body }),
      invalidatesTags: ['ValidatorDecks'],
    }),
    getMyValidatorDialects: builder.query<ValidatorDialectAssignment[], void>({
      query: () => '/validator/decks/my-dialects',
      providesTags: ['ValidatorDialectAssignments'],
    }),
    getValidatorDecks: builder.query<
      ValidatorDeckSummary[],
      { filter?: 'mine' | 'all' | 'pendingMyApproval' } | void
    >({
      query: (params) => ({ url: '/validator/decks', params: params ?? undefined }),
      providesTags: ['ValidatorDecks'],
    }),
    getValidatorDeck: builder.query<ValidatorDeckDetail, string>({
      query: (id) => `/validator/decks/${id}`,
      providesTags: (_result, _error, id) => [{ type: 'ValidatorDecks', id }],
    }),
    updateValidatorDeck: builder.mutation<
      ValidatorDeckSummary,
      { id: string; body: { name?: string; dialectTag?: string; countryCode?: string } }
    >({
      query: ({ id, body }) => ({ url: `/validator/decks/${id}`, method: 'PATCH', body }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'ValidatorDecks', id },
        'ValidatorDecks',
      ],
    }),
    addValidatorDeckItem: builder.mutation<ValidatorDeckItem, { id: string; recordingId: string }>({
      query: ({ id, recordingId }) => ({
        url: `/validator/decks/${id}/items`,
        method: 'POST',
        body: { recordingId },
      }),
      // Also invalidates the pool-browse list -- each recording there
      // carries myDeckId (which of the caller's own decks already
      // contains it), and adding one needs that to refresh so Task Mode's
      // Transcribe/Flag stop prompting "Add to Deck" for it.
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'ValidatorDecks', id },
        'ValidatorDecks',
        'ValidatorRecordings',
      ],
    }),
    removeValidatorDeckItem: builder.mutation<void, { id: string; recordingId: string }>({
      query: ({ id, recordingId }) => ({
        url: `/validator/decks/${id}/items/${recordingId}`,
        method: 'DELETE',
      }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'ValidatorDecks', id },
        'ValidatorDecks',
      ],
    }),
    scoreValidatorDeckItem: builder.mutation<
      ValidatorDeckItem,
      { id: string; recordingId: string; body: ScoreValidatorDeckItemInput }
    >({
      query: ({ id, recordingId, body }) => ({
        url: `/validator/decks/${id}/items/${recordingId}/score`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'ValidatorDecks', id },
        'ValidatorDecks',
      ],
    }),
    updateValidatorTranscript: builder.mutation<
      ValidatorDeckItem,
      { id: string; recordingId: string; transcript: string }
    >({
      query: ({ id, recordingId, transcript }) => ({
        url: `/validator/decks/${id}/items/${recordingId}/transcript`,
        method: 'PATCH',
        body: { transcript },
      }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'ValidatorDecks', id },
        'ValidatorDecks',
      ],
    }),
    flagValidatorDeckItem: builder.mutation<
      ValidatorDeckItem,
      { id: string; recordingId: string; reason: ValidatorFlagReason; note?: string }
    >({
      query: ({ id, recordingId, reason, note }) => ({
        url: `/validator/decks/${id}/items/${recordingId}/flag`,
        method: 'POST',
        body: { reason, note },
      }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'ValidatorDecks', id },
        'ValidatorDecks',
      ],
    }),
    getValidatorRecordings: builder.query<ValidatorRecordingsPage, ListValidatorRecordingsParams>({
      query: (params) => ({ url: '/validator/recordings', params }),
      providesTags: ['ValidatorRecordings'],
    }),
    submitValidatorDeck: builder.mutation<ValidatorDeckSummary, string>({
      query: (id) => ({ url: `/validator/decks/${id}/submit`, method: 'POST' }),
      invalidatesTags: (_result, _error, id) => [
        { type: 'ValidatorDecks', id },
        'ValidatorDecks',
        'AdminValidatorDecks',
      ],
    }),
    approveValidatorDeck: builder.mutation<ValidatorDeckSummary, string>({
      query: (id) => ({ url: `/validator/decks/${id}/approve`, method: 'POST' }),
      invalidatesTags: (_result, _error, id) => [
        { type: 'ValidatorDecks', id },
        'ValidatorDecks',
        'AdminValidatorDecks',
      ],
    }),
    rejectValidatorDeck: builder.mutation<ValidatorDeckSummary, { id: string; reason: string }>({
      query: ({ id, reason }) => ({
        url: `/validator/decks/${id}/reject`,
        method: 'POST',
        body: { reason },
      }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'ValidatorDecks', id },
        'ValidatorDecks',
        'AdminValidatorDecks',
      ],
    }),
    getValidatorDeckAuditLog: builder.query<ValidatorDeckAuditLogEntry[], string>({
      query: (id) => `/validator/decks/${id}/audit-log`,
      providesTags: (_result, _error, id) => [{ type: 'ValidatorDecks', id: `${id}-audit` }],
    }),
    getAdminValidatorDecks: builder.query<
      ValidatorDeckSummary[],
      { status?: ValidatorDeckSummary['status']; ownerUserId?: string } | void
    >({
      query: (params) => ({ url: '/admin/validator-decks', params: params ?? undefined }),
      providesTags: ['AdminValidatorDecks'],
    }),
    adminApproveValidatorDeck: builder.mutation<ValidatorDeckSummary, string>({
      query: (id) => ({ url: `/admin/validator-decks/${id}/approve`, method: 'POST' }),
      invalidatesTags: (_result, _error, id) => [
        { type: 'ValidatorDecks', id },
        'ValidatorDecks',
        'AdminValidatorDecks',
      ],
    }),
    adminPublishValidatorDeck: builder.mutation<ValidatorDeckSummary, string>({
      query: (id) => ({ url: `/admin/validator-decks/${id}/publish`, method: 'POST' }),
      invalidatesTags: (_result, _error, id) => [
        { type: 'ValidatorDecks', id },
        'ValidatorDecks',
        'AdminValidatorDecks',
      ],
    }),
    adminReassignValidatorDeck: builder.mutation<
      ValidatorDeckSummary,
      { id: string; body: ReassignValidatorDeckInput }
    >({
      query: ({ id, body }) => ({
        url: `/admin/validator-decks/${id}/reassign`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'ValidatorDecks', id },
        'ValidatorDecks',
        'AdminValidatorDecks',
      ],
    }),
    adminArchiveValidatorDeck: builder.mutation<ValidatorDeckSummary, string>({
      query: (id) => ({ url: `/admin/validator-decks/${id}/archive`, method: 'POST' }),
      invalidatesTags: (_result, _error, id) => [
        { type: 'ValidatorDecks', id },
        'ValidatorDecks',
        'AdminValidatorDecks',
      ],
    }),
    adminCloneFromStreamDeck: builder.mutation<ValidatorDeckSummary, CloneFromStreamDeckInput>({
      query: (body) => ({ url: '/admin/validator-decks/from-stream-deck', method: 'POST', body }),
      invalidatesTags: ['ValidatorDecks', 'AdminValidatorDecks'],
    }),
    getVdclInventoryPreview: builder.query<
      VdclInventoryPreview,
      { contributorId: string; dialectTag: string }
    >({
      query: (params) => ({ url: '/admin/vdcl/inventory', params }),
    }),
    compileVdclVersion: builder.mutation<VdclCompilationResult, string>({
      query: (id) => ({ url: `/admin/vdcl/versions/${id}/compile`, method: 'POST' }),
      invalidatesTags: (_r, _e, id) => [{ type: 'VdclManifest', id }, 'VdclAgreements'],
    }),
    getVdclManifest: builder.query<VdclManifestInspection, { id: string; page?: number }>({
      query: ({ id, page }) => ({
        url: `/admin/vdcl/versions/${id}/manifest`,
        params: page ? { page } : undefined,
      }),
      providesTags: (_r, _e, { id }) => [{ type: 'VdclManifest', id }],
    }),
    getVdclExclusions: builder.query<VdclExclusionReport, string>({
      query: (id) => `/admin/vdcl/versions/${id}/exclusions`,
      providesTags: (_r, _e, id) => [{ type: 'VdclManifest', id: `${id}-exclusions` }],
    }),
    verifyVdclManifestHash: builder.query<VdclHashVerification, string>({
      query: (id) => `/admin/vdcl/versions/${id}/verify-hash`,
    }),
    getVdclReadiness: builder.query<VdclReadiness, void>({
      query: () => '/vdcl/readiness',
      providesTags: ['VdclMaker'],
    }),
    getMyVdclVersions: builder.query<VdclVersionSummary[], void>({
      query: () => '/vdcl/versions',
      providesTags: ['VdclMaker'],
    }),
    startVdclDraft: builder.mutation<StartVdclDraftResult, StartVdclDraftInput>({
      query: (body) => ({ url: '/vdcl/drafts', method: 'POST', body }),
      invalidatesTags: ['VdclMaker'],
    }),
    getVdclReview: builder.query<VdclReviewPayload, string>({
      query: (id) => `/vdcl/versions/${id}/review`,
      providesTags: (_r, _e, id) => [{ type: 'VdclMaker', id }],
    }),
    getVdclVersionStatus: builder.query<VdclTrackerStatus, string>({
      query: (id) => `/vdcl/versions/${id}/status`,
      providesTags: (_r, _e, id) => [{ type: 'VdclMaker', id: `${id}-status` }],
    }),
    requestVdclSigningOtp: builder.mutation<
      { otpRequestId: string; expiresInSeconds: number; manifestHash: string | null },
      string
    >({
      query: (id) => ({ url: `/vdcl/versions/${id}/signing-otp`, method: 'POST' }),
    }),
    signVdclVersion: builder.mutation<
      { versionId: string; status: VdclVersionStatus; signedAt: string | null },
      {
        id: string;
        otpRequestId: string;
        code: string;
        signatureKind: 'drawn' | 'typed' | 'digital';
        signatureLabel?: string;
      }
    >({
      query: ({ id, ...body }) => ({
        url: `/vdcl/versions/${id}/sign`,
        method: 'POST',
        body,
      }),
      invalidatesTags: ['VdclMaker'],
    }),
    getVdclReceipt: builder.query<VdclSigningReceipt, string>({
      query: (id) => `/vdcl/versions/${id}/receipt`,
    }),
    getVdclAgreements: builder.query<VdclAgreementSummary[], { take?: number } | void>({
      query: (params) => ({ url: '/admin/vdcl/agreements', params: params ?? undefined }),
      providesTags: ['VdclAgreements'],
    }),
    getVdclAgreement: builder.query<VdclAgreementDetail, string>({
      query: (id) => `/admin/vdcl/agreements/${id}`,
      providesTags: (_r, _e, id) => [{ type: 'VdclAgreements', id }],
    }),
    requestVdclCountersignOtp: builder.mutation<
      { otpRequestId: string; expiresInSeconds: number },
      string
    >({
      query: (id) => ({ url: `/admin/vdcl/versions/${id}/countersign-otp`, method: 'POST' }),
    }),
    countersignVdclVersion: builder.mutation<
      { id: string; status: VdclVersionStatus },
      { id: string; otpRequestId?: string; code?: string }
    >({
      query: ({ id, ...body }) => ({
        url: `/admin/vdcl/versions/${id}/activate`,
        method: 'POST',
        body,
      }),
      invalidatesTags: ['VdclAgreements', 'VdclManifest'],
    }),
    suspendVdclVersion: builder.mutation<
      unknown,
      { id: string; reason: string } & VdclStepUp
    >({
      query: ({ id, ...body }) => ({
        url: `/admin/vdcl/versions/${id}/suspend`,
        method: 'POST',
        body,
      }),
      invalidatesTags: ['VdclAgreements'],
    }),
    /**
     * Admin's own copy of a licence document. Distinct from
     * getVdclDocumentLink, which hits the contributor route and would 403
     * for an admin who is not that contributor.
     */
    getAdminVdclDocumentLink: builder.query<VdclDocumentLink, { id: string; kind: 'pdf' | 'png' }>({
      query: ({ id, kind }) => `/admin/vdcl/versions/${id}/documents/${kind}`,
    }),
    /**
     * Issue a step-up code for a licence action other than countersignature.
     * Bound server-side to the action AND its target, so a code cannot be
     * moved between actions or between licences.
     */
    requestVdclActionOtp: builder.mutation<
      { otpRequestId: string; expiresInSeconds: number },
      { scope: 'versions' | 'agreements'; id: string; action: VdclAdminActionName }
    >({
      query: ({ scope, id, action }) => ({
        url: `/admin/vdcl/${scope}/${id}/action-otp`,
        method: 'POST',
        body: { action },
      }),
    }),
    revokeVdclCountersignature: builder.mutation<
      unknown,
      { id: string; reason: string } & VdclStepUp
    >({
      query: ({ id, ...body }) => ({
        url: `/admin/vdcl/versions/${id}/revoke-countersignature`,
        method: 'POST',
        body,
      }),
      invalidatesTags: ['VdclAgreements', 'VdclMaker'],
    }),
    reinstateVdclVersion: builder.mutation<unknown, { id: string } & VdclStepUp>({
      query: ({ id, ...body }) => ({
        url: `/admin/vdcl/versions/${id}/reinstate`,
        method: 'POST',
        body,
      }),
      invalidatesTags: ['VdclAgreements'],
    }),
    withdrawVdclAgreement: builder.mutation<
      unknown,
      { id: string; reason: string } & VdclStepUp
    >({
      query: ({ id, ...body }) => ({
        url: `/admin/vdcl/agreements/${id}/withdraw`,
        method: 'POST',
        body,
      }),
      invalidatesTags: ['VdclAgreements'],
    }),
    reissueVdclDocuments: builder.mutation<unknown, { id: string } & VdclStepUp>({
      query: ({ id, ...body }) => ({
        url: `/admin/vdcl/versions/${id}/reissue-documents`,
        method: 'POST',
        body,
      }),
      invalidatesTags: ['VdclAgreements'],
    }),
    verifyVdclLicence: builder.query<VdclPublicVerification, string>({
      query: (token) => `/verify/${token}`,
    }),
    getVdclDocumentLink: builder.query<VdclDocumentLink, { id: string; kind: 'pdf' | 'png' }>({
      query: ({ id, kind }) => `/vdcl/versions/${id}/documents/${kind}`,
    }),
    discardVdclDraft: builder.mutation<{ versionId: string; status: string }, string>({
      query: (id) => ({ url: `/vdcl/versions/${id}`, method: 'DELETE' }),
      invalidatesTags: ['VdclMaker'],
    }),
  }),
});

export const {
  useRegisterMutation,
  useSendReferralInviteMutation,
  useGetReferralInvitationsQuery,
  useRequestMagicLinkMutation,
  useRequestPasswordResetMutation,
  useResetPasswordMutation,
  useChangePasswordMutation,
  useUpdateTwoFactorMutation,
  useRequestAccountCloseOtpMutation,
  useCloseAccountMutation,
  useVerifyEmailMutation,
  useResendEmailVerificationMutation,
  useGetCountriesQuery,
  useGetDialectsQuery,
  useGetAllDialectsQuery,
  useGetDialectVariantsQuery,
  useGetWalletQuery,
  useGetP2PSettingsQuery,
  useGetP2PTradingEligibilityQuery,
  useGetP2PReferenceRateQuery,
  useGetP2PPaymentInstructionsQuery,
  useUpdateP2PPaymentInstructionsMutation,
  useListP2POffersQuery,
  useListMyP2POffersQuery,
  useGetP2PTraderProfileQuery,
  useRequestP2PTradeOtpMutation,
  useCreateP2POfferMutation,
  useAcceptP2POfferMutation,
  useCancelP2POfferMutation,
  useUpdateP2POfferMutation,
  useDeleteP2POfferMutation,
  useListMyP2PTradesQuery,
  useGetP2PTradeQuery,
  useGetP2POfferQuery,
  useLazyGetP2POfferQuery,
  useMarkP2PTradePaidMutation,
  useRequestP2PTradeCancelMutation,
  useReleaseP2PTradeMutation,
  useRaiseP2PDisputeMutation,
  useListP2PTradeMessagesQuery,
  useSendP2PTradeMessageMutation,
  useCreateP2PChatUploadUrlMutation,
  useLazyGetP2PChatAttachmentUrlQuery,
  useGetTrainerDashboardQuery,
  useGetCommunityStatsQuery,
  useGetAdminCommunitySpacesQuery,
  useCreateAdminCommunitySpaceMutation,
  useUpdateAdminCommunitySpaceMutation,
  useDeleteAdminCommunitySpaceMutation,
  useReorderAdminCommunitySpacesMutation,
  useGetAdminCommunityTagsQuery,
  useCreateAdminCommunityTagMutation,
  useRenameAdminCommunityTagMutation,
  useMergeAdminCommunityTagsMutation,
  useHideAdminCommunityTagMutation,
  useDeleteAdminCommunityTagMutation,
  useGetAdminCommunityMembersQuery,
  useGetAdminCommunityMemberQuery,
  useSuspendCommunityMemberMutation,
  useBanCommunityMemberMutation,
  useRestoreCommunityMemberMutation,
  useGetAdminCommunitySettingsQuery,
  useUpdateAdminCommunitySettingsMutation,
  useGetAdminCommunityPostsByAuthorQuery,
  useGetAdminCommunityRepliesQuery,
  useGetTrainerReportQuery,
  useEmailTrainerReportMutation,
  useGetEarningHistoryQuery,
  useGetWalletActivityQuery,
  useGetEarningsChartQuery,
  useGetMyWordRecordingsQuery,
  useStartWordTrainingSessionMutation,
  useLazyGetNextWordTrainingAssignmentQuery,
  useLazyGetSpellingSuggestionsQuery,
  useEndWordTrainingSessionMutation,
  useSignQracMutation,
  useListMyTestimoniesQuery,
  useCreateTestimonyUploadUrlMutation,
  useSubmitTestimonyMutation,
  useDeleteMyTestimonyMutation,
  useGetAdminTestimonialsQuery,
  useReviewTestimonyMutation,
  useUpdateTestimonyTextMutation,
  useSetTestimonyVisibilityMutation,
  useGetMarketingMaterialsQuery,
  useCreateCampaignShareMutation,
  useGetMyMarketingSharesQuery,
  useGetAdminMarketingPhotosQuery,
  useCreateMarketingPhotoUploadUrlMutation,
  useCreateMarketingPhotoMutation,
  useUpdateMarketingPhotoMutation,
  useDeleteMarketingPhotoMutation,
  useGetAdminMarketingHeadlinesQuery,
  useCreateMarketingHeadlineMutation,
  useUpdateMarketingHeadlineMutation,
  useDeleteMarketingHeadlineMutation,
  useCreateWordRecordingUploadMutation,
  useSubmitWordRecordingMutation,
  useLazyGetNextDomainConversationPromptQuery,
  useCreateDomainConversationRecordingUploadMutation,
  useSubmitDomainConversationRecordingMutation,
  useGetMyDomainConversationRecordingsQuery,
  useLazyGetNextWordValidationItemQuery,
  useSubmitWordValidationMutation,
  useGetMisplacedDialectRecordingsQuery,
  useResolveMisplacedDialectRecordingMutation,
  useGetAdminDomainPromptsQuery,
  useGetAdminDomainPromptDomainsQuery,
  useCreateDomainPromptAdminMutation,
  useUpdateDomainPromptAdminMutation,
  useSetDomainPromptDisabledAdminMutation,
  useDeleteDomainPromptAdminMutation,
  useRequestDepositOtpMutation,
  useCreateTokenDepositMutation,
  useRequestFlutterwaveDepositOtpMutation,
  useCreateFlutterwaveDepositMutation,
  useLazyVerifyFlutterwaveDepositQuery,
  useCheckFlutterwaveDepositStatusMutation,
  useGetWithdrawalMinAmountQuery,
  useRequestWithdrawalOtpMutation,
  useCreateWithdrawalMutation,
  useListAdminWithdrawalsQuery,
  useListPayoutAccountsQuery,
  useCreatePayoutAccountMutation,
  useRequestPayoutAccountSetupOtpMutation,
  useCreateStripePayoutOnboardingLinkMutation,
  useRefreshStripePayoutAccountStatusMutation,
  useUpdatePayoutAccountMutation,
  useDeletePayoutAccountMutation,
  useListPaymentMethodsQuery,
  useListAdminPaymentMethodsQuery,
  useCreateAdminPaymentMethodMutation,
  useUpdateAdminPaymentMethodMutation,
  useDeleteAdminPaymentMethodMutation,
  useCreateAdminPaymentMethodLogoUploadUrlMutation,
  useConfirmAdminPaymentMethodLogoUploadMutation,
  useRequestPayoutAccountDeleteOtpMutation,
  useCreateKycSessionMutation,
  useGetKycStatusQuery,
  useCancelMyKycMutation,
  useListKycVerificationsQuery,
  useGetKycVerificationQuery,
  useRefreshKycVerificationMutation,
  useCancelKycVerificationMutation,
  useApproveKycVerificationMutation,
  useDeclineKycVerificationMutation,
  useRevokeKycVerificationMutation,
  useLazyGetKycDecisionQuery,
  useListKycEvidenceQuery,
  useLazyGetKycEvidenceImageQuery,
  useGetTokenomicsStatusQuery,
  useGetValuationHistoryQuery,
  useRecalculateValuationMutation,
  usePauseMintingMutation,
  useResumeMintingMutation,
  useBurnTokensMutation,
  useListReserveTransactionsQuery,
  useListTokenOperationsQuery,
  useGetTokenomicsPolicyQuery,
  useUpdateTokenomicsPolicyMutation,
  usePinTokenomicsValueMutation,
  useUnpinTokenomicsValueMutation,
  useRequestWithdrawalResolveOtpMutation,
  useApproveWithdrawalMutation,
  useSubmitWithdrawalToNowPaymentsMutation,
  useVerifyWithdrawalPayoutMutation,
  useRefreshWithdrawalStatusMutation,
  useCancelNowPaymentsWithdrawalMutation,
  useBulkResolveWithdrawalsMutation,
  useSubmitWithdrawalToFlutterwaveMutation,
  useRefreshWithdrawalStatusFlutterwaveMutation,
  useListBanksQuery,
  useResolveWithdrawalMutation,
  useGetMeQuery,
  useUpdateProfileMutation,
  useRecordPwaInstallationMutation,
  useGetNotificationsQuery,
  useGetBannerUpdatesQuery,
  useMarkNotificationReadMutation,
  useMarkAllNotificationsReadMutation,
  useGetAdminSystemUpdatesQuery,
  useCreateSystemUpdateMutation,
  useUpdateSystemUpdateMutation,
  useDeleteSystemUpdateMutation,
  useRequestPhoneOtpMutation,
  useVerifyPhoneMutation,
  useSavePhoneUnverifiedMutation,
  useRequestManualPhoneVerificationMutation,
  useMarkManualPhoneVerificationSentMutation,
  useCreateDataAccessLeadMutation,
  useGetAdminDataAccessLeadsQuery,
  useUpdateAdminDataAccessLeadContactMutation,
  useInviteDataAccessLeadMutation,
  useDeleteDataAccessLeadMutation,
  useResendDataAccessLeadInviteMutation,
  useCreateSupportRequestMutation,
  useGetAdminSupportRequestsQuery,
  useUpdateAdminSupportRequestResolutionMutation,
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
  useGetAdminStatsQuery,
  useGetAdminLeaderboardQuery,
  useGetAdminLeaderboardEarnersQuery,
  useGetAdminLeaderboardContributorsQuery,
  useGetProofAccountReportQuery,
  useLazyGetProofAccountReportPdfUrlQuery,
  useSendProofAccountReportMutation,
  useGetMyProofAccountReportQuery,
  useLazyGetMyProofAccountReportPdfUrlQuery,
  useGetAdminP2PSettingsQuery,
  useUpdateAdminP2PSettingsMutation,
  useListIntegrationsQuery,
  useListMyIntegrationsQuery,
  useSubscribeToIntegrationMutation,
  useListPeerReviewQueueQuery,
  useListMyPeerReviewsQuery,
  useClaimPeerReviewMutation,
  useReleasePeerReviewMutation,
  useSubmitPeerReviewMutation,
  useLazyGetPeerReviewEvidenceImageQuery,
  useGetAdminPeerReviewQueueQuery,
  useResetPeerReviewsMutation,
  useGetAdminIntegrationSubscriptionsQuery,
  useReviewIntegrationSubscriptionMutation,
  useSetIntegrationSubscriptionCertifiedMutation,
  useUnsubscribeFromIntegrationMutation,
  useRequestWhatsAppValidationMutation,
  useRegenerateWhatsAppValidationCodeMutation,
  useReleaseWhatsAppValidationClaimMutation,
  useCancelWhatsAppValidationRequestMutation,
  useGetMyWhatsAppValidationRequestQuery,
  useListPendingWhatsAppValidationsQuery,
  useGetWhatsAppValidationPendingCountQuery,
  useListMyWhatsAppValidationClaimsQuery,
  useClaimWhatsAppValidationMutation,
  useVerifyWhatsAppValidationRequestMutation,
  useRejectWhatsAppValidationRequestMutation,
  useListAdminIntegrationsQuery,
  useUpdateAdminIntegrationMutation,
  useListAdminP2PTradesQuery,
  useListAdminP2PDisputesQuery,
  useRequestP2PForceResolveOtpMutation,
  useForceResolveP2PTradeMutation,
  useResolveP2PDisputeMutation,
  useGetUsersQuery,
  useGetAuditHoldQueueQuery,
  useListAdminManualPhoneVerificationsQuery,
  useVerifyAdminManualPhoneVerificationMutation,
  useConfirmAdminManualPhoneVerificationMutation,
  useRejectAdminManualPhoneVerificationMutation,
  useListAdminWhatsAppValidationsQuery,
  useVerifyAdminWhatsAppValidationMutation,
  useForceVerifyAdminWhatsAppValidationMutation,
  useRejectAdminWhatsAppValidationMutation,
  useListAdminSmsContactsQuery,
  useListAdminSmsMessagesQuery,
  useSendAdminSmsMutation,
  useUpdateUserRoleMutation,
  useUpdateUserStatusMutation,
  useUpdateTrainerRatingMutation,
  useUpdateValidatorLevelMutation,
  useGetValidatorDialectAssignmentsQuery,
  useAssignValidatorDialectMutation,
  useUnassignValidatorDialectMutation,
  useGetAdminUserQuery,
  useResetUserDialectMutation,
  useGetUserActivityQuery,
  useRequestUserLockOtpMutation,
  useLockUserMutation,
  useRequestUserDeleteOtpMutation,
  useDeleteUserMutation,
  useRequestAuditHoldReleaseOtpMutation,
  useReleaseAuditHoldMutation,
  useRequestRevokePhoneOtpMutation,
  useRevokePhoneVerificationMutation,
  useSendInstantTrainerReportMutation,
  useRequestAdminWalletAdjustmentOtpMutation,
  useCreateAdminWalletAdjustmentMutation,
  useGetAdminTrainerRecordingsQuery,
  useGetAdminAllRecordingsQuery,
  useGetConnectAdminOverviewQuery,
  useDecideConnectSpeakerMutation,
  useResendConnectPhotoLinkMutation,
  useSendConnectRemindersMutation,
  useWithdrawConnectSpeakerMutation,
  useDeleteConnectRegistrationMutation,
  useGetAsrCoverageQuery,
  useSetAsrBackfillMutation,
  useGetUnsettledQuery,
  useSettleOneMutation,
  useSettleAllMutation,
  useRequestRecordingAuditClawbackOtpMutation,
  useAuditRecordingMutation,
  useRequestTrainingPayoutOtpMutation,
  useCreateTrainingPayoutMutation,
  useGetAudioRetentionRulesQuery,
  useCreateAudioRetentionRuleMutation,
  useUpdateAudioRetentionRuleMutation,
  useDeleteAudioRetentionRuleMutation,
  useGetAdminCountriesQuery,
  useCreateCountryMutation,
  useUpdateCountryMutation,
  useDeleteCountryMutation,
  useResetCountryExchangeRateMutation,
  useRefreshExchangeRatesNowMutation,
  useGetAdminDialectsQuery,
  useGetAdminDialectVariantsQuery,
  useGetAllAdminDialectVariantsQuery,
  useCreateDialectVariantMutation,
  useUpdateDialectVariantMutation,
  useDeleteDialectVariantMutation,
  useCreateDialectMutation,
  useUpdateDialectMutation,
  useDeleteDialectMutation,
  useGenerateDialectKeyboardLayoutMutation,
  useGetPlatformSettingsQuery,
  useGetPublicClientSettingsQuery,
  useChatWithAssistantMutation,
  useGetAssistantThreadQuery,
  useGetAdminAssistantConversationsQuery,
  useGetAdminAssistantConversationQuery,
  useCreateAdminAssistantGithubIssueMutation,
  useGetAdminFaqsQuery,
  useCreateFaqMutation,
  useUpdateFaqMutation,
  useDeleteFaqMutation,
  useUpdatePlatformSettingsMutation,
  useUploadTopBannerImageMutation,
  useUploadConnectHeroImageMutation,
  useGetApiAccessTokensQuery,
  useSetApiAccessTokenMutation,
  useDeleteApiAccessTokenMutation,
  useGetSubscriptionPlansQuery,
  useUpsertSubscriptionPlanMutation,
  useDeleteSubscriptionPlanMutation,
  useGetPublicSubscriptionPlansQuery,
  useGetAdminWordsQuery,
  useDeleteWordMutation,
  useSetWordDisabledMutation,
  useBulkDeleteWordsMutation,
  useBulkSetWordsDisabledMutation,
  useGetAdminSentencesQuery,
  useDeleteSentenceMutation,
  useSetSentenceDisabledMutation,
  useBulkDeleteSentencesMutation,
  useBulkSetSentencesDisabledMutation,
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
  useGetIncompleteRequiredCoursesQuery,
  useGetSuggestedCoursesQuery,
  useDismissSuggestedCourseMutation,
  useCreateValidatorDeckMutation,
  useGetMyValidatorDialectsQuery,
  useGetValidatorDecksQuery,
  useGetValidatorDeckQuery,
  useUpdateValidatorDeckMutation,
  useAddValidatorDeckItemMutation,
  useRemoveValidatorDeckItemMutation,
  useScoreValidatorDeckItemMutation,
  useUpdateValidatorTranscriptMutation,
  useFlagValidatorDeckItemMutation,
  useGetValidatorRecordingsQuery,
  useSubmitValidatorDeckMutation,
  useApproveValidatorDeckMutation,
  useRejectValidatorDeckMutation,
  useGetValidatorDeckAuditLogQuery,
  useGetAdminValidatorDecksQuery,
  useAdminApproveValidatorDeckMutation,
  useAdminPublishValidatorDeckMutation,
  useAdminReassignValidatorDeckMutation,
  useAdminArchiveValidatorDeckMutation,
  useAdminCloneFromStreamDeckMutation,
  useGetVdclInventoryPreviewQuery,
  useCompileVdclVersionMutation,
  useGetVdclManifestQuery,
  useGetVdclExclusionsQuery,
  useVerifyVdclManifestHashQuery,
  useGetVdclReadinessQuery,
  useGetMyVdclVersionsQuery,
  useStartVdclDraftMutation,
  useGetVdclReviewQuery,
  useGetVdclVersionStatusQuery,
  useRequestVdclSigningOtpMutation,
  useSignVdclVersionMutation,
  useGetVdclReceiptQuery,
  useDiscardVdclDraftMutation,
  useVerifyVdclLicenceQuery,
  useGetVdclAgreementsQuery,
  useGetVdclAgreementQuery,
  useRequestVdclCountersignOtpMutation,
  useCountersignVdclVersionMutation,
  useSuspendVdclVersionMutation,
  useLazyGetAdminVdclDocumentLinkQuery,
  useReinstateVdclVersionMutation,
  useRequestVdclActionOtpMutation,
  useRevokeVdclCountersignatureMutation,
  useWithdrawVdclAgreementMutation,
  useReissueVdclDocumentsMutation,
  useLazyGetVdclDocumentLinkQuery,
} = dialectivaApi;

export { normalizeErrorMessage };

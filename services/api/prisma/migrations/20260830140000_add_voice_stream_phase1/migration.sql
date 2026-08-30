-- Dialect Library Voice Stream -- Phase 1 (Subscriber Foundation).
-- Fully separate tenant/security boundary from the trainer-facing schema:
-- SubscriberUser/SubscriberOrganization/SubscriberMembership are new,
-- independent of User/Role/RefreshToken/OtpCode.

ALTER TYPE "OtpPurpose" ADD VALUE 'SUBSCRIBER_EMAIL_VERIFY';
ALTER TYPE "OtpPurpose" ADD VALUE 'SUBSCRIBER_LOGIN';

CREATE TYPE "SubscriberOrgRole" AS ENUM ('OWNER', 'ADMIN', 'DATASET_MANAGER', 'VALIDATOR', 'API_DEVELOPER', 'BILLING_MANAGER', 'AUDITOR');

CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIAL', 'ACTIVE', 'PAST_DUE', 'GRACE_PERIOD', 'SUSPENDED', 'CANCELED');

CREATE TABLE "subscriber_organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "stripeCustomerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscriber_organizations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "subscriber_organizations_slug_key" ON "subscriber_organizations"("slug");

CREATE UNIQUE INDEX "subscriber_organizations_stripeCustomerId_key" ON "subscriber_organizations"("stripeCustomerId");

CREATE TABLE "subscriber_users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "emailVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscriber_users_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "subscriber_users_email_key" ON "subscriber_users"("email");

CREATE TABLE "subscriber_memberships" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "role" "SubscriberOrgRole" NOT NULL,
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),

    CONSTRAINT "subscriber_memberships_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "subscriber_memberships_userId_organizationId_key" ON "subscriber_memberships"("userId", "organizationId");

CREATE INDEX "subscriber_memberships_organizationId_idx" ON "subscriber_memberships"("organizationId");

CREATE TABLE "subscriber_invites" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "SubscriberOrgRole" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "invitedByUserId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscriber_invites_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "subscriber_invites_tokenHash_key" ON "subscriber_invites"("tokenHash");

CREATE INDEX "subscriber_invites_organizationId_idx" ON "subscriber_invites"("organizationId");

CREATE INDEX "subscriber_invites_email_idx" ON "subscriber_invites"("email");

CREATE TABLE "subscriber_otp_codes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "purpose" "OtpPurpose" NOT NULL,
    "codeHash" TEXT NOT NULL,
    "ticketHash" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscriber_otp_codes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "subscriber_otp_codes_ticketHash_key" ON "subscriber_otp_codes"("ticketHash");

CREATE INDEX "subscriber_otp_codes_userId_purpose_idx" ON "subscriber_otp_codes"("userId", "purpose");

CREATE INDEX "subscriber_otp_codes_expiresAt_idx" ON "subscriber_otp_codes"("expiresAt");

CREATE TABLE "subscriber_refresh_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "replacedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscriber_refresh_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "subscriber_refresh_tokens_tokenHash_key" ON "subscriber_refresh_tokens"("tokenHash");

CREATE INDEX "subscriber_refresh_tokens_userId_idx" ON "subscriber_refresh_tokens"("userId");

CREATE INDEX "subscriber_refresh_tokens_familyId_idx" ON "subscriber_refresh_tokens"("familyId");

CREATE TABLE "subscription_plans" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "stripePriceId" TEXT NOT NULL,
    "monthlyUsdAmount" DECIMAL(10,2) NOT NULL,
    "maxStreamDecks" INTEGER,
    "maxTeamMembers" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "subscription_plans_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "subscription_plans_key_key" ON "subscription_plans"("key");

CREATE UNIQUE INDEX "subscription_plans_stripePriceId_key" ON "subscription_plans"("stripePriceId");

CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIAL',
    "stripeSubscriptionId" TEXT,
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "subscriptions_organizationId_key" ON "subscriptions"("organizationId");

CREATE UNIQUE INDEX "subscriptions_stripeSubscriptionId_key" ON "subscriptions"("stripeSubscriptionId");

CREATE TABLE "stripe_webhook_events" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stripe_webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "stream_decks" (
    "id" TEXT NOT NULL,
    "deckKey" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stream_decks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "stream_decks_deckKey_key" ON "stream_decks"("deckKey");

CREATE INDEX "stream_decks_organizationId_idx" ON "stream_decks"("organizationId");

CREATE TABLE "stream_deck_items" (
    "id" TEXT NOT NULL,
    "deckId" TEXT NOT NULL,
    "recordingId" TEXT NOT NULL,
    "addedByUserId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stream_deck_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "stream_deck_items_deckId_recordingId_key" ON "stream_deck_items"("deckId", "recordingId");

CREATE INDEX "stream_deck_items_deckId_idx" ON "stream_deck_items"("deckId");

CREATE TABLE "catalogue_preview_logs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "recordingId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "catalogue_preview_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "catalogue_preview_logs_organizationId_createdAt_idx" ON "catalogue_preview_logs"("organizationId", "createdAt");

ALTER TABLE "subscriber_invites" ADD CONSTRAINT "subscriber_invites_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "subscriber_organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "subscriber_memberships" ADD CONSTRAINT "subscriber_memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "subscriber_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "subscriber_memberships" ADD CONSTRAINT "subscriber_memberships_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "subscriber_organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "subscriber_otp_codes" ADD CONSTRAINT "subscriber_otp_codes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "subscriber_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "subscriber_refresh_tokens" ADD CONSTRAINT "subscriber_refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "subscriber_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "subscriber_organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "subscription_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "stream_decks" ADD CONSTRAINT "stream_decks_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "subscriber_organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "stream_deck_items" ADD CONSTRAINT "stream_deck_items_deckId_fkey" FOREIGN KEY ("deckId") REFERENCES "stream_decks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

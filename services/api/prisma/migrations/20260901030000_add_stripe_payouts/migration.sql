-- Stripe Connect Express: second fiat payout rail alongside Flutterwave.
-- Onboarding (identity + bank account) happens on Stripe-hosted pages via
-- an Account Link -- we never store raw bank details for this rail, only
-- the connected account id and its Stripe-reported status flags.

-- PayoutMethod/PayoutAccountType: new STRIPE/STRIPE_CONNECT members.
ALTER TYPE "PayoutMethod" ADD VALUE 'STRIPE';
ALTER TYPE "PayoutAccountType" ADD VALUE 'STRIPE_CONNECT';

-- PayoutAccount: STRIPE_CONNECT field group.
ALTER TABLE "payout_accounts" ADD COLUMN "stripeConnectAccountId" TEXT;
ALTER TABLE "payout_accounts" ADD COLUMN "stripeDetailsSubmitted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "payout_accounts" ADD COLUMN "stripePayoutsEnabled" BOOLEAN NOT NULL DEFAULT false;

-- PlatformSettings: admin rollout toggle, off by default.
ALTER TABLE "platform_settings" ADD COLUMN "isStripePayoutsEnabled" BOOLEAN NOT NULL DEFAULT false;

-- StripePayoutEvent: audit/reconciliation log, mirrors flutterwave_payout_events.
CREATE TABLE "stripe_payout_events" (
    "id" TEXT NOT NULL,
    "eventHash" TEXT NOT NULL,
    "withdrawalRequestId" TEXT,
    "providerPayoutId" TEXT,
    "eventType" TEXT NOT NULL,
    "providerStatus" TEXT,
    "payload" JSONB NOT NULL,
    "processingError" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stripe_payout_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "stripe_payout_events_eventHash_key" ON "stripe_payout_events"("eventHash");

CREATE INDEX "stripe_payout_events_withdrawalRequestId_idx" ON "stripe_payout_events"("withdrawalRequestId");

CREATE INDEX "stripe_payout_events_providerPayoutId_idx" ON "stripe_payout_events"("providerPayoutId");

ALTER TABLE "stripe_payout_events" ADD CONSTRAINT "stripe_payout_events_withdrawalRequestId_fkey" FOREIGN KEY ("withdrawalRequestId") REFERENCES "withdrawal_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

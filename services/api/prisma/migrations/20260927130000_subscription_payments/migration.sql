-- Money actually received from a subscriber organisation.
--
-- Purely additive: one new table, no existing row touched, no behaviour change
-- until the invoice.payment_succeeded webhook starts writing to it. Production
-- has recorded zero payments ever, so there is nothing to backfill and nothing
-- that could already be wrong.
--
-- Why this table has to exist before any revenue sharing: a contributor pool
-- computed from SubscriptionPlan.monthlyUsdAmount would mint DL against money
-- that may have failed, been refunded or been charged back. Subscription.status
-- = ACTIVE is a state, not a receipt. This is the receipt.

CREATE TABLE "subscription_payments" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "stripeInvoiceId" TEXT NOT NULL,
    "stripePaymentIntentId" TEXT,
    "stripeSubscriptionId" TEXT,
    -- Minor units and currency exactly as Stripe reports them. Unconverted on
    -- purpose: converting here would bake one day's FX rate into the permanent
    -- record, and the rate actually used belongs on the pool that used it.
    "amountPaidCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    -- Stripe's billing window, not our calendar month.
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    -- From status_transitions.paid_at: when the money arrived, not when the
    -- webhook was processed.
    "paidAt" TIMESTAMP(3) NOT NULL,
    -- Reversal state. Amount rather than a boolean, because partial refunds
    -- are real.
    "refundedAt" TIMESTAMP(3),
    "refundedAmountCents" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_payments_pkey" PRIMARY KEY ("id")
);

-- One row per Stripe invoice. This unique is what makes payment recording
-- idempotent: the webhook-event gate catches an identical event replay, but two
-- DIFFERENT events can reference the same invoice.
CREATE UNIQUE INDEX "subscription_payments_stripeInvoiceId_key"
  ON "subscription_payments"("stripeInvoiceId");

CREATE INDEX "subscription_payments_organizationId_paidAt_idx"
  ON "subscription_payments"("organizationId", "paidAt");
CREATE INDEX "subscription_payments_periodStart_idx"
  ON "subscription_payments"("periodStart");
-- Refunds and disputes arrive as Charge events, which carry payment_intent but
-- not invoice, so this is the only join back to the payment being reversed.
CREATE INDEX "subscription_payments_stripePaymentIntentId_idx"
  ON "subscription_payments"("stripePaymentIntentId");

ALTER TABLE "subscription_payments"
  ADD CONSTRAINT "subscription_payments_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "subscriber_organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

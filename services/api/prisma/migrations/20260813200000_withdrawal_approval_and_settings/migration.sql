ALTER TYPE "WithdrawalStatus" ADD VALUE IF NOT EXISTS 'APPROVED';

ALTER TABLE "withdrawal_requests"
  ADD COLUMN "approvedByAdminId" TEXT,
  ADD COLUMN "approvedAt" TIMESTAMP(3),
  ADD COLUMN "providerNetwork" TEXT,
  ADD COLUMN "destinationCurrency" TEXT NOT NULL DEFAULT 'USDT',
  ADD COLUMN "destinationNetwork" TEXT NOT NULL DEFAULT 'TRC20';

-- eventHash dedupes a specific inbound payout callback delivery, mirroring
-- nowpayments_ipn_events.eventHash for deposits. The column was added in
-- the previous migration with no such key; backfill any existing rows with
-- a random placeholder (they predate the payout webhook/callback endpoint
-- entirely, so there is nothing real to dedupe against) before enforcing
-- NOT NULL/UNIQUE.
ALTER TABLE "nowpayments_payout_events" ADD COLUMN "eventHash" TEXT;
UPDATE "nowpayments_payout_events" SET "eventHash" = gen_random_uuid()::text WHERE "eventHash" IS NULL;
ALTER TABLE "nowpayments_payout_events" ALTER COLUMN "eventHash" SET NOT NULL;
CREATE UNIQUE INDEX "nowpayments_payout_events_eventHash_key" ON "nowpayments_payout_events"("eventHash");

ALTER TABLE "platform_settings"
  ADD COLUMN "cryptoWithdrawalsEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "nowPaymentsPayoutsEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "allowedWithdrawalCurrencies" TEXT NOT NULL DEFAULT 'USDT',
  ADD COLUMN "allowedWithdrawalNetworks" TEXT NOT NULL DEFAULT 'TRC20',
  ADD COLUMN "withdrawalFeeMode" TEXT NOT NULL DEFAULT 'platform',
  ADD COLUMN "withdrawalFeeTokenAmount" DECIMAL(20,8) NOT NULL DEFAULT 0,
  ADD COLUMN "withdrawalFeePercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN "autoSubmitAfterApproval" BOOLEAN NOT NULL DEFAULT false;

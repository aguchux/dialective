ALTER TYPE "WithdrawalStatus" ADD VALUE IF NOT EXISTS 'PROCESSING';
ALTER TYPE "WithdrawalStatus" ADD VALUE IF NOT EXISTS 'FAILED';

ALTER TABLE "withdrawal_requests"
  ADD COLUMN "provider" TEXT,
  ADD COLUMN "providerPayoutId" TEXT,
  ADD COLUMN "providerStatus" TEXT,
  ADD COLUMN "providerCurrency" TEXT,
  ADD COLUMN "providerAddress" TEXT,
  ADD COLUMN "providerPayload" JSONB,
  ADD COLUMN "providerError" TEXT,
  ADD COLUMN "submittedToProviderAt" TIMESTAMP(3),
  ADD COLUMN "providerSettledAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "withdrawal_requests_providerPayoutId_key" ON "withdrawal_requests"("providerPayoutId");
CREATE INDEX "withdrawal_requests_providerPayoutId_idx" ON "withdrawal_requests"("providerPayoutId");

CREATE TABLE "nowpayments_payout_events" (
  "id" TEXT NOT NULL,
  "withdrawalRequestId" TEXT,
  "providerPayoutId" TEXT,
  "eventType" TEXT NOT NULL,
  "providerStatus" TEXT,
  "payload" JSONB NOT NULL,
  "processingError" TEXT,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "nowpayments_payout_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "nowpayments_payout_events_withdrawalRequestId_idx" ON "nowpayments_payout_events"("withdrawalRequestId");
CREATE INDEX "nowpayments_payout_events_providerPayoutId_idx" ON "nowpayments_payout_events"("providerPayoutId");

ALTER TABLE "nowpayments_payout_events"
  ADD CONSTRAINT "nowpayments_payout_events_withdrawalRequestId_fkey"
  FOREIGN KEY ("withdrawalRequestId") REFERENCES "withdrawal_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

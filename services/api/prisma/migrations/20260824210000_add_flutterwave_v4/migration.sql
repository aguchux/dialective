-- Flutterwave v4 (Customer + PaymentMethod/Charge, Recipient + Sender/
-- Transfer) as a new, additive rail alongside the existing v3 hosted-
-- checkout-link flow. Every addition is nullable/default-safe -- no
-- backfill, and isFlutterwaveV4Enabled ships off, so v3 stays the active
-- rail until an admin explicitly opts in.

ALTER TABLE "users" ADD COLUMN "flutterwaveCustomerId" TEXT;

ALTER TABLE "payout_accounts" ADD COLUMN "providerRecipientId" TEXT;

ALTER TABLE "platform_settings" ADD COLUMN "isFlutterwaveV4Enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "platform_settings" ADD COLUMN "flutterwaveV4SenderId" TEXT;

CREATE TABLE "flutterwave_v4_charge_events" (
  "id" TEXT NOT NULL,
  "eventHash" TEXT NOT NULL,
  "chargeId" TEXT,
  "reference" TEXT,
  "depositId" TEXT,
  "eventType" TEXT,
  "providerStatus" TEXT,
  "payload" JSONB NOT NULL,
  "processingError" TEXT,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  CONSTRAINT "flutterwave_v4_charge_events_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "flutterwave_v4_charge_events_eventHash_key" ON "flutterwave_v4_charge_events"("eventHash");
CREATE INDEX "flutterwave_v4_charge_events_depositId_idx" ON "flutterwave_v4_charge_events"("depositId");
CREATE INDEX "flutterwave_v4_charge_events_chargeId_idx" ON "flutterwave_v4_charge_events"("chargeId");
ALTER TABLE "flutterwave_v4_charge_events" ADD CONSTRAINT "flutterwave_v4_charge_events_depositId_fkey"
  FOREIGN KEY ("depositId") REFERENCES "deposits"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "flutterwave_v4_transfer_events" (
  "id" TEXT NOT NULL,
  "eventHash" TEXT NOT NULL,
  "transferId" TEXT,
  "reference" TEXT,
  "withdrawalRequestId" TEXT,
  "eventType" TEXT,
  "providerStatus" TEXT,
  "payload" JSONB NOT NULL,
  "processingError" TEXT,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "flutterwave_v4_transfer_events_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "flutterwave_v4_transfer_events_eventHash_key" ON "flutterwave_v4_transfer_events"("eventHash");
CREATE INDEX "flutterwave_v4_transfer_events_withdrawalRequestId_idx" ON "flutterwave_v4_transfer_events"("withdrawalRequestId");
CREATE INDEX "flutterwave_v4_transfer_events_transferId_idx" ON "flutterwave_v4_transfer_events"("transferId");
ALTER TABLE "flutterwave_v4_transfer_events" ADD CONSTRAINT "flutterwave_v4_transfer_events_withdrawalRequestId_fkey"
  FOREIGN KEY ("withdrawalRequestId") REFERENCES "withdrawal_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

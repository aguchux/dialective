ALTER TABLE "deposits"
ALTER COLUMN "provider" SET DEFAULT 'nowpayments';

UPDATE "deposits"
SET "provider" = 'nowpayments'
WHERE "provider" = 'coinbase_commerce';

ALTER TABLE "deposits"
ADD COLUMN "providerPaymentId" TEXT,
ADD COLUMN "providerStatus" TEXT,
ADD COLUMN "actuallyPaid" DECIMAL(20,8),
ADD COLUMN "payCurrency" TEXT,
ADD COLUMN "lastIpnAt" TIMESTAMP(3);

CREATE TABLE "nowpayments_ipn_events" (
    "id" TEXT NOT NULL,
    "eventHash" TEXT NOT NULL,
    "orderId" TEXT,
    "depositId" TEXT,
    "providerPaymentId" TEXT,
    "paymentStatus" TEXT,
    "payload" JSONB NOT NULL,
    "processingError" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "nowpayments_ipn_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "nowpayments_ipn_events_eventHash_key" ON "nowpayments_ipn_events"("eventHash");
CREATE INDEX "nowpayments_ipn_events_depositId_idx" ON "nowpayments_ipn_events"("depositId");
CREATE INDEX "nowpayments_ipn_events_providerPaymentId_idx" ON "nowpayments_ipn_events"("providerPaymentId");

ALTER TABLE "nowpayments_ipn_events"
ADD CONSTRAINT "nowpayments_ipn_events_depositId_fkey"
FOREIGN KEY ("depositId") REFERENCES "deposits"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterEnum
-- ALTER TYPE ... ADD VALUE cannot run inside the same transaction as a
-- statement that uses the new value -- neither new value is referenced
-- elsewhere in this file, so both are safe to add here (same reasoning as
-- 20260908160000_add_validator_payouts_and_publish's VALIDATION_REWARD).
ALTER TYPE "LedgerEntryType" ADD VALUE 'WHATSAPP_VALIDATION_FEE';
ALTER TYPE "LedgerEntryType" ADD VALUE 'WHATSAPP_VALIDATION_PAYOUT';

-- CreateEnum
CREATE TYPE "WhatsAppValidationRequestStatus" AS ENUM ('PENDING', 'CLAIMED', 'VERIFIED', 'REJECTED', 'EXPIRED');

-- CreateTable
CREATE TABLE "integrations" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "iconKey" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "feeTokenAmount" DECIMAL(20,8) NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_subscriptions" (
    "id" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subscribedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "integration_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_validation_requests" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "otpHash" TEXT NOT NULL,
    "status" "WhatsAppValidationRequestStatus" NOT NULL DEFAULT 'PENDING',
    "feeTokenAmount" DECIMAL(20,8) NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "claimedByValidatorId" TEXT,
    "claimedAt" TIMESTAMP(3),
    "claimExpiresAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_validation_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "integrations_slug_key" ON "integrations"("slug");

-- CreateIndex
CREATE INDEX "integrations_enabled_sortOrder_idx" ON "integrations"("enabled", "sortOrder");

-- CreateIndex
CREATE INDEX "integration_subscriptions_userId_idx" ON "integration_subscriptions"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "integration_subscriptions_integrationId_userId_key" ON "integration_subscriptions"("integrationId", "userId");

-- CreateIndex
CREATE INDEX "whatsapp_validation_requests_status_createdAt_idx" ON "whatsapp_validation_requests"("status", "createdAt");

-- CreateIndex
CREATE INDEX "whatsapp_validation_requests_requesterId_status_idx" ON "whatsapp_validation_requests"("requesterId", "status");

-- CreateIndex
CREATE INDEX "whatsapp_validation_requests_claimedByValidatorId_idx" ON "whatsapp_validation_requests"("claimedByValidatorId");

-- AddForeignKey
ALTER TABLE "integration_subscriptions" ADD CONSTRAINT "integration_subscriptions_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_subscriptions" ADD CONSTRAINT "integration_subscriptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_validation_requests" ADD CONSTRAINT "whatsapp_validation_requests_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_validation_requests" ADD CONSTRAINT "whatsapp_validation_requests_claimedByValidatorId_fkey" FOREIGN KEY ("claimedByValidatorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

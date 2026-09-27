-- Phase 4 of docs/Stream-Revenue-Sharing-Engine.md: pool computation in shadow
-- mode. Adds no financial surface -- every pool this creates carries
-- settledAt NULL, which means computed but never minted.

-- AlterTable
ALTER TABLE "platform_settings"
  ADD COLUMN "royaltiesEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "royaltyShadowMode" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "royaltySharePercent" DECIMAL(5,2) NOT NULL DEFAULT 30.00;

-- CreateTable
CREATE TABLE "royalty_pools" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "collectedUsd" DECIMAL(14,2) NOT NULL,
    "fxRateUsed" DECIMAL(18,8) NOT NULL,
    "sharePercentUsed" DECIMAL(5,2) NOT NULL,
    "tokenUsdRateUsed" DECIMAL(18,8) NOT NULL,
    "poolDl" DECIMAL(20,8) NOT NULL,
    "totalStreamCount" INTEGER NOT NULL,
    "settledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "royalty_pools_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "royalty_accruals" (
    "id" TEXT NOT NULL,
    "poolId" TEXT NOT NULL,
    "contributorId" TEXT NOT NULL,
    "streamCount" INTEGER NOT NULL,
    "amountDl" DECIMAL(20,8) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "royalty_accruals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "royalty_rate_periods" (
    "id" TEXT NOT NULL,
    "sharePercent" DECIMAL(5,2) NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "changedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "royalty_rate_periods_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "royalty_pools_paymentId_key" ON "royalty_pools"("paymentId");

-- CreateIndex
CREATE INDEX "royalty_pools_periodStart_idx" ON "royalty_pools"("periodStart");

-- CreateIndex
CREATE INDEX "royalty_pools_organizationId_periodStart_idx" ON "royalty_pools"("organizationId", "periodStart");

-- CreateIndex
CREATE INDEX "royalty_pools_settledAt_idx" ON "royalty_pools"("settledAt");

-- CreateIndex
CREATE INDEX "royalty_accruals_contributorId_createdAt_idx" ON "royalty_accruals"("contributorId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "royalty_accruals_poolId_contributorId_key" ON "royalty_accruals"("poolId", "contributorId");

-- CreateIndex
CREATE UNIQUE INDEX "royalty_rate_periods_effectiveFrom_key" ON "royalty_rate_periods"("effectiveFrom");

-- AddForeignKey
ALTER TABLE "royalty_pools" ADD CONSTRAINT "royalty_pools_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "subscription_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "royalty_accruals" ADD CONSTRAINT "royalty_accruals_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "royalty_pools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "royalty_accruals" ADD CONSTRAINT "royalty_accruals_contributorId_fkey" FOREIGN KEY ("contributorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

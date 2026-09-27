-- Phase 7 of docs/Stream-Revenue-Sharing-Engine.md: royalty payouts on the
-- existing PayoutAccount rails.
--
-- Its OWN table rather than a flag on withdrawal_requests, per section 8. The
-- two rails debit different balance columns and write different ledger types,
-- and the existing withdrawal path's compensating-delete clears ledger rows by
-- `reference` with no type filter -- so sharing a table would let one rail's
-- rollback delete the other rail's ledger row.

-- AlterEnum
-- Appended at the end to match the schema's declared order.
ALTER TYPE "OtpPurpose" ADD VALUE IF NOT EXISTS 'ROYALTY_WITHDRAWAL';

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "RoyaltyWithdrawalStatus" AS ENUM ('PENDING', 'APPROVED', 'PROCESSING', 'PAID', 'FAILED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AlterTable
ALTER TABLE "platform_settings"
  ADD COLUMN "royaltyMinimumPayout" DECIMAL(20,8) NOT NULL DEFAULT 500;

-- CreateTable
CREATE TABLE "royalty_withdrawal_requests" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "tokenAmount" DECIMAL(20,8) NOT NULL,
    "usdAmount" DECIMAL(20,8) NOT NULL,
    "payoutAccountId" TEXT,
    "status" "RoyaltyWithdrawalStatus" NOT NULL DEFAULT 'PENDING',
    "approvedByAdminId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "adminNote" TEXT,
    "provider" TEXT,
    "providerPayoutId" TEXT,
    "providerStatus" TEXT,
    "providerError" TEXT,
    "providerSettledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "royalty_withdrawal_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "royalty_withdrawal_requests_providerPayoutId_key" ON "royalty_withdrawal_requests"("providerPayoutId");

-- CreateIndex
CREATE INDEX "royalty_withdrawal_requests_walletId_createdAt_idx" ON "royalty_withdrawal_requests"("walletId", "createdAt");

-- CreateIndex
CREATE INDEX "royalty_withdrawal_requests_status_createdAt_idx" ON "royalty_withdrawal_requests"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "royalty_withdrawal_requests" ADD CONSTRAINT "royalty_withdrawal_requests_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "royalty_withdrawal_requests" ADD CONSTRAINT "royalty_withdrawal_requests_payoutAccountId_fkey" FOREIGN KEY ("payoutAccountId") REFERENCES "payout_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

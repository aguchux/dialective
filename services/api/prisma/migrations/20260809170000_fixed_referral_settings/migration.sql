-- Referral bonuses are fixed platform settings, not admin-created campaigns.
-- Keep REFERRAL_COMMISSION in the enum for legacy ledger rows, but stop using
-- it for new writes.
ALTER TYPE "LedgerEntryType" ADD VALUE IF NOT EXISTS 'TRAINING_PAYOUT';
ALTER TYPE "LedgerEntryType" ADD VALUE IF NOT EXISTS 'REFERRAL_FUNDING_BONUS';
ALTER TYPE "LedgerEntryType" ADD VALUE IF NOT EXISTS 'REFERRAL_PAYOUT_BONUS';

CREATE TABLE "referral_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "fundingBonusRate" DECIMAL(5,4) NOT NULL DEFAULT 0.10,
    "fundingBonusEnabled" BOOLEAN NOT NULL DEFAULT true,
    "payoutBonusRate" DECIMAL(5,4) NOT NULL DEFAULT 0.00,
    "payoutBonusEnabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referral_settings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "referral_settings" ("id", "fundingBonusRate", "fundingBonusEnabled", "payoutBonusRate", "payoutBonusEnabled")
VALUES ('default', 0.10, true, 0.00, false)
ON CONFLICT ("id") DO NOTHING;

DROP TABLE IF EXISTS "referral_programs";

CREATE UNIQUE INDEX IF NOT EXISTS "ledger_entries_walletId_type_reference_key"
ON "ledger_entries"("walletId", "type", "reference");

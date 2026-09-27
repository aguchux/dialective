-- Phase 5 of docs/Stream-Revenue-Sharing-Engine.md: the royaltyBalance column
-- plus the five integration fixes in 6.1. The column exists and is unused --
-- nothing credits or debits it until Phase 6.
--
-- royaltyFundedAmount on withdrawal_requests is the fix for 6.1(a), the
-- laundering hole: it records which balance funded a withdrawal so a REJECTION
-- returns each portion to the column it came from, instead of crediting
-- `balance` unconditionally and turning withdraw-only royalty DL into spendable,
-- P2P-tradeable DL.

-- AlterEnum
-- Placed AFTER P2P_ESCROW_CREDIT to match the schema's declared order, so a
-- later `prisma migrate diff` sees no drift. ADD VALUE without BEFORE/AFTER
-- appends to the end, which would drift permanently.
ALTER TYPE "LedgerEntryType" ADD VALUE IF NOT EXISTS 'ROYALTY_ACCRUAL' AFTER 'P2P_ESCROW_CREDIT';
ALTER TYPE "LedgerEntryType" ADD VALUE IF NOT EXISTS 'ROYALTY_WITHDRAWAL' AFTER 'ROYALTY_ACCRUAL';
ALTER TYPE "LedgerEntryType" ADD VALUE IF NOT EXISTS 'ROYALTY_WITHDRAWAL_REVERSED' AFTER 'ROYALTY_WITHDRAWAL';
ALTER TYPE "LedgerEntryType" ADD VALUE IF NOT EXISTS 'ROYALTY_ADJUSTMENT' AFTER 'ROYALTY_WITHDRAWAL_REVERSED';

-- AlterTable
ALTER TABLE "wallets" ADD COLUMN "royaltyBalance" DECIMAL(20,8) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "withdrawal_requests" ADD COLUMN "royaltyFundedAmount" DECIMAL(20,8) NOT NULL DEFAULT 0;

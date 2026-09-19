-- The member being verified pays for their own ID Review.
--
-- Until now the platform minted the peer reviewers' fee, so every KYC
-- verification created new DL. Charging the applicant instead makes it a
-- CIRCULATING payment (applicant -> reviewers) rather than an issuance
-- event, and gives a member a concrete reason to acquire DL.
--
-- Nullable throughout and backfilled to nothing: verifications that
-- already happened were platform-funded and are left exactly as they
-- were. Only new submissions are charged.
ALTER TABLE "kyc_verifications"
  ADD COLUMN "reviewFeeTokenAmount" DECIMAL(20,8),
  -- Idempotency guard: set once when the fee is taken, so a resubmit of
  -- the same verification cannot charge twice.
  ADD COLUMN "reviewFeeChargedAt" TIMESTAMP(3),
  ADD COLUMN "reviewFeeRefundedAt" TIMESTAMP(3),
  -- The portion the platform absorbed because the member could not
  -- afford it. KYC is a compliance requirement, so an empty wallet must
  -- never block verification -- this records the gap instead of refusing.
  ADD COLUMN "reviewFeeShortfall" DECIMAL(20,8);

-- New ledger types for the applicant-side debit and its refund. Added to
-- the existing enum rather than reusing VALIDATION_REWARD/ADMIN_ADJUSTMENT
-- so this money movement is separable in reporting.
ALTER TYPE "LedgerEntryType" ADD VALUE IF NOT EXISTS 'KYC_REVIEW_FEE';
ALTER TYPE "LedgerEntryType" ADD VALUE IF NOT EXISTS 'KYC_REVIEW_FEE_REFUND';

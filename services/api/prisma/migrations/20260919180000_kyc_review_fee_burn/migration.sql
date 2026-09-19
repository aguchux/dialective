-- A certified reviewer's fee is BURNED, not paid out.
--
-- Certified reviewers are the platform's own staff, compensated outside
-- the token economy. Crediting them DL would recycle the applicant's fee
-- straight back into circulation as a payout for work already paid for,
-- which defeats the point of charging it. Destroying it instead makes the
-- fee a genuine sink: supply leaves the system permanently.
--
-- Peer reviews are unaffected -- a community reviewer is not salaried, so
-- their fee is still a real payout (see payReviewers).
--
-- Tracked in two places deliberately:
--   * these columns answer "what happened to THIS verification's fee"
--   * KYC_REVIEW_FEE_BURN ledger rows answer "how much DL has this
--     mechanism destroyed in total", via SUM(amount)
ALTER TABLE "kyc_verifications"
  ADD COLUMN "reviewFeeBurnedAmount" DECIMAL(20,8),
  ADD COLUMN "reviewFeeBurnedAt" TIMESTAMP(3);

-- NOTE on the ledger row this type marks: it carries a POSITIVE amount
-- and does NOT move a balance. The applicant's balance already moved on
-- KYC_REVIEW_FEE; this is an audit annotation naming how much of that
-- debit was destroyed. Every existing aggregate over ledger_entries
-- filters by an explicit allow-list of types (see
-- LIFETIME_CREDIT_ENTRY_TYPES / EXTERNAL_TOPUP_ENTRY_TYPES), so this new
-- type is excluded from balance and earnings maths by default -- but any
-- FUTURE reconciliation that sums amounts across all types must exclude
-- it, or it will double-count.
ALTER TYPE "LedgerEntryType" ADD VALUE IF NOT EXISTS 'KYC_REVIEW_FEE_BURN';

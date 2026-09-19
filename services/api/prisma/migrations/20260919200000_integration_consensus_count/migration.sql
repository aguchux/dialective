-- Agreeing peer verdicts needed to decide an item outright.
--
-- Default 2 matches the KYC_PEER_REVIEW_QUORUM constant this replaces, so
-- existing rows keep the behaviour they already had. The difference is what
-- reaching that count now MEANS: peer consensus applies the verdict to the
-- applicant's KycStatus directly, with no admin step.
ALTER TABLE "integrations"
  ADD COLUMN "consensusCount" INTEGER NOT NULL DEFAULT 2;

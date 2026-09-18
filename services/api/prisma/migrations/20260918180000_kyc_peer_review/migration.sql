-- Community review of identity documents (the `p2p-kyc-review`
-- integration).
--
-- Subscribed, admin-approved members check that the name on a document
-- matches the account and type back the number they can read. Two
-- agreeing verdicts send it to an admin, who makes the real decision --
-- peers never move a trainer's KycStatus themselves.

CREATE TYPE "KycPeerReviewVerdict" AS ENUM ('APPROVE', 'DECLINE');

-- documentNumberHash, never the number: the typed value only has to prove
-- the reviewer read the card, which a hash comparison does. Storing it
-- plaintext would put a second copy of an ID number in a table far more
-- rows can read than the encrypted decision blob.
CREATE TABLE "kyc_peer_reviews" (
  "id" TEXT NOT NULL,
  "kycVerificationId" TEXT NOT NULL,
  "reviewerId" TEXT NOT NULL,
  "verdict" "KycPeerReviewVerdict" NOT NULL,
  "documentNumberHash" TEXT NOT NULL,
  "documentNumberMatched" BOOLEAN NOT NULL,
  "declineReason" TEXT,
  "paidAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "kyc_peer_reviews_pkey" PRIMARY KEY ("id")
);

-- One verdict per reviewer per verification: nobody reviews the same
-- document twice, so the quorum cannot be reached by one person.
CREATE UNIQUE INDEX "kyc_peer_reviews_kycVerificationId_reviewerId_key"
  ON "kyc_peer_reviews"("kycVerificationId", "reviewerId");
CREATE INDEX "kyc_peer_reviews_kycVerificationId_idx"
  ON "kyc_peer_reviews"("kycVerificationId");
CREATE INDEX "kyc_peer_reviews_reviewerId_createdAt_idx"
  ON "kyc_peer_reviews"("reviewerId", "createdAt");

ALTER TABLE "kyc_peer_reviews"
  ADD CONSTRAINT "kyc_peer_reviews_kycVerificationId_fkey"
  FOREIGN KEY ("kycVerificationId") REFERENCES "kyc_verifications"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "kyc_peer_reviews"
  ADD CONSTRAINT "kyc_peer_reviews_reviewerId_fkey"
  FOREIGN KEY ("reviewerId") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- A reviewer's hold while they work, so two peers are never shown the
-- same document at once. Expires on its own so an abandoned claim returns
-- to the pool.
CREATE TABLE "kyc_peer_review_claims" (
  "id" TEXT NOT NULL,
  "kycVerificationId" TEXT NOT NULL,
  "reviewerId" TEXT NOT NULL,
  "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "claimExpiresAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "kyc_peer_review_claims_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "kyc_peer_review_claims_kycVerificationId_reviewerId_key"
  ON "kyc_peer_review_claims"("kycVerificationId", "reviewerId");
CREATE INDEX "kyc_peer_review_claims_claimExpiresAt_idx"
  ON "kyc_peer_review_claims"("claimExpiresAt");

ALTER TABLE "kyc_peer_review_claims"
  ADD CONSTRAINT "kyc_peer_review_claims_kycVerificationId_fkey"
  FOREIGN KEY ("kycVerificationId") REFERENCES "kyc_verifications"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "kyc_peer_review_claims"
  ADD CONSTRAINT "kyc_peer_review_claims_reviewerId_fkey"
  FOREIGN KEY ("reviewerId") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Append-only record of anyone opening a document image. The client-side
-- copy/drag/right-click blocks are deterrents; this is what makes access
-- attributable, and it is written before the bytes are served.
CREATE TABLE "kyc_evidence_view_logs" (
  "id" TEXT NOT NULL,
  "kycVerificationId" TEXT NOT NULL,
  "viewerId" TEXT NOT NULL,
  "evidenceId" TEXT NOT NULL,
  "viewerRole" TEXT NOT NULL,
  "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "kyc_evidence_view_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "kyc_evidence_view_logs_kycVerificationId_viewedAt_idx"
  ON "kyc_evidence_view_logs"("kycVerificationId", "viewedAt");
CREATE INDEX "kyc_evidence_view_logs_viewerId_viewedAt_idx"
  ON "kyc_evidence_view_logs"("viewerId", "viewedAt");

ALTER TABLE "kyc_evidence_view_logs"
  ADD CONSTRAINT "kyc_evidence_view_logs_viewerId_fkey"
  FOREIGN KEY ("viewerId") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

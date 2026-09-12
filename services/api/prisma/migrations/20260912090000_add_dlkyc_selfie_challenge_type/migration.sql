-- AlterTable: track which pose challenge (TURN_LEFT/TURN_RIGHT) was issued
-- for a self-hosted DLKYC selfie, so evaluate() can verify actual compliance
-- against landmark motion direction, not just "some motion happened."
ALTER TABLE "kyc_verifications"
  ADD COLUMN "selfieChallengeType" TEXT;

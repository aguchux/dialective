-- AlterTable: admin-configurable auto-approve floors for DLKYC self-hosted
-- verification, defaulting to the values evaluateSelfHostedKyc previously
-- hardcoded (85 face match, 80 liveness).
ALTER TABLE "platform_settings"
  ADD COLUMN "selfHostedKycMinFaceMatchScore" INTEGER NOT NULL DEFAULT 85,
  ADD COLUMN "selfHostedKycMinLivenessScore" INTEGER NOT NULL DEFAULT 80;

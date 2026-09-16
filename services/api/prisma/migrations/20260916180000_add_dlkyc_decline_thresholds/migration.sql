ALTER TABLE "platform_settings"
  ADD COLUMN "selfHostedKycMaxFaceMatchScoreForDecline" INTEGER NOT NULL DEFAULT 40,
  ADD COLUMN "selfHostedKycMaxLivenessScoreForDecline" INTEGER NOT NULL DEFAULT 40,
  ADD COLUMN "selfHostedKycRequireDocumentFaceDetected" BOOLEAN NOT NULL DEFAULT true;

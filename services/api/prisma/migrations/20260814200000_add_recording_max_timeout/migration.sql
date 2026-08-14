ALTER TABLE "platform_settings" ADD COLUMN "wordTrainingRecordingMaxTimeoutSeconds" INTEGER;

CREATE INDEX "referral_invites_inviterId_status_expiresAt_idx" ON "referral_invites"("inviterId", "status", "expiresAt");

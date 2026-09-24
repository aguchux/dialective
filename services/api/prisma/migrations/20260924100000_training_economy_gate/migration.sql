-- Master switch for the stake-and-payout training economy. Defaults TRUE so
-- applying this migration changes nothing: the platform keeps charging and
-- paying exactly as before until an admin deliberately switches it off.
ALTER TABLE "platform_settings"
  ADD COLUMN "trainingEconomyEnabled" BOOLEAN NOT NULL DEFAULT true;

-- Its own OTP purpose rather than borrowing ADMIN_PAYOUT, so the emailed
-- code says what is actually being authorised.
ALTER TYPE "OtpPurpose" ADD VALUE IF NOT EXISTS 'TRAINING_ECONOMY_TOGGLE';

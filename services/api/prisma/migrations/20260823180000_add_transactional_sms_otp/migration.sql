ALTER TABLE "platform_settings"
ADD COLUMN "smsTransactionalOtpEnabled" BOOLEAN NOT NULL DEFAULT true;

-- Make SMSLive247 the primary transactional provider for both direct-code OTP
-- delivery and ordinary transactional notifications. The remaining providers
-- remain ordered fallbacks.
UPDATE "platform_settings"
SET "smsTransactionalProviderOrder" = 'smslive247,termii,twilio,africastalking';

ALTER TABLE "platform_settings" ADD COLUMN "smslive247NativeOtpEnabled" BOOLEAN NOT NULL DEFAULT false;

-- smslive247 can't serve the fire-and-forget fallback-chain contract (see
-- schema.prisma comment) -- revert any existing row back to the 3-provider
-- default and default column value.
ALTER TABLE "platform_settings" ALTER COLUMN "smsProviderOrder" SET DEFAULT 'termii,twilio,africastalking';

UPDATE "platform_settings"
SET "smsProviderOrder" = 'termii,twilio,africastalking'
WHERE "smsProviderOrder" = 'termii,twilio,africastalking,smslive247';

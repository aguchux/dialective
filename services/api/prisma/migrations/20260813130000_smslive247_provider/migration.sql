ALTER TABLE "platform_settings" ALTER COLUMN "smsProviderOrder" SET DEFAULT 'termii,twilio,africastalking,smslive247';

UPDATE "platform_settings"
SET "smsProviderOrder" = 'termii,twilio,africastalking,smslive247'
WHERE "smsProviderOrder" = 'termii,twilio,africastalking';

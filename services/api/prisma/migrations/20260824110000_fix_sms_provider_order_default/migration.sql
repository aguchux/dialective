-- The 20260823180000_add_transactional_sms_otp migration updated existing
-- rows' smsTransactionalProviderOrder value but never altered the column's
-- DEFAULT, leaving it out of sync with the schema's @default annotation.
ALTER TABLE "platform_settings"
  ALTER COLUMN "smsTransactionalProviderOrder" SET DEFAULT 'smslive247,termii,twilio,africastalking';

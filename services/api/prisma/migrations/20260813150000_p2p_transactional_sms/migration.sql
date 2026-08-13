ALTER TABLE "platform_settings" ADD COLUMN "smsTransactionalProviderOrder" TEXT NOT NULL DEFAULT 'termii,twilio,africastalking,smslive247';
ALTER TABLE "platform_settings" ADD COLUMN "p2pSmsTradeCreatedEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "platform_settings" ADD COLUMN "p2pSmsPaymentMarkedEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "platform_settings" ADD COLUMN "p2pSmsTokensReleasedEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "platform_settings" ADD COLUMN "p2pSmsCancelledEnabled" BOOLEAN NOT NULL DEFAULT false;

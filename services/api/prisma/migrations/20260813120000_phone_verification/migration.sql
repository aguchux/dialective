ALTER TYPE "OtpPurpose" ADD VALUE IF NOT EXISTS 'PHONE_VERIFICATION';

ALTER TABLE "users" ADD COLUMN "phoneNumber" TEXT;
ALTER TABLE "users" ADD COLUMN "phoneVerifiedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "users_phoneNumber_key" ON "users"("phoneNumber");

ALTER TABLE "platform_settings" ADD COLUMN "smsProviderOrder" TEXT NOT NULL DEFAULT 'termii,twilio,africastalking';

-- Manual WhatsApp-assisted phone verification.

ALTER TYPE "LedgerEntryType" ADD VALUE IF NOT EXISTS 'PHONE_VERIFICATION_FEE';
ALTER TYPE "LedgerEntryType" ADD VALUE IF NOT EXISTS 'PHONE_VERIFICATION_FEE_REFUND';

CREATE TYPE "ManualPhoneVerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED', 'EXPIRED');

ALTER TABLE "platform_settings"
  ADD COLUMN "manualPhoneVerificationEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "manualPhoneVerificationFeeTokens" DECIMAL(20,8) NOT NULL DEFAULT 1,
  ADD COLUMN "manualPhoneVerificationWhatsappNumber" TEXT NOT NULL DEFAULT '1234567890';

CREATE TABLE "manual_phone_verification_requests" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "phoneNumber" TEXT NOT NULL,
  "otpHash" TEXT NOT NULL,
  "status" "ManualPhoneVerificationStatus" NOT NULL DEFAULT 'PENDING',
  "feeTokenAmount" DECIMAL(20,8) NOT NULL DEFAULT 1,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 5,
  "sentAt" TIMESTAMP(3),
  "verifiedByAdminId" TEXT,
  "verifiedAt" TIMESTAMP(3),
  "rejectedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "manual_phone_verification_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "manual_phone_verification_requests_status_createdAt_idx" ON "manual_phone_verification_requests"("status", "createdAt");
CREATE INDEX "manual_phone_verification_requests_userId_status_idx" ON "manual_phone_verification_requests"("userId", "status");
CREATE INDEX "manual_phone_verification_requests_phoneNumber_status_idx" ON "manual_phone_verification_requests"("phoneNumber", "status");
CREATE INDEX "manual_phone_verification_requests_verifiedByAdminId_idx" ON "manual_phone_verification_requests"("verifiedByAdminId");

ALTER TABLE "manual_phone_verification_requests"
  ADD CONSTRAINT "manual_phone_verification_requests_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "manual_phone_verification_requests"
  ADD CONSTRAINT "manual_phone_verification_requests_verifiedByAdminId_fkey"
  FOREIGN KEY ("verifiedByAdminId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

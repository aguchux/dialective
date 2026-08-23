-- AI KYC verification via Didit.me (hosted ID scan + selfie + face-match).
-- Purely additive: isKycRequiredForWithdrawals defaults false, so this
-- migration ships inert until explicitly enabled and Didit credentials are
-- configured. User.kycStatus defaults NOT_STARTED for all existing rows.
CREATE TYPE "KycStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'IN_REVIEW', 'APPROVED', 'DECLINED', 'ABANDONED', 'EXPIRED');

CREATE TABLE "kyc_verifications" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'didit',
  "providerSessionId" TEXT NOT NULL,
  "status" "KycStatus" NOT NULL DEFAULT 'NOT_STARTED',
  "documentType" TEXT,
  "documentNumberMasked" TEXT,
  "faceMatchScore" DECIMAL(5,2),
  "livenessScore" DECIMAL(5,2),
  "decisionEncryptedJson" JSONB,
  "declineReason" TEXT,
  "webhookReceivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "kyc_verifications_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "kyc_verifications_providerSessionId_key" ON "kyc_verifications"("providerSessionId");
CREATE INDEX "kyc_verifications_userId_status_idx" ON "kyc_verifications"("userId", "status");
CREATE INDEX "kyc_verifications_status_createdAt_idx" ON "kyc_verifications"("status", "createdAt");
ALTER TABLE "kyc_verifications" ADD CONSTRAINT "kyc_verifications_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "users" ADD COLUMN "kycStatus" "KycStatus" NOT NULL DEFAULT 'NOT_STARTED';
ALTER TABLE "users" ADD COLUMN "kycVerifiedAt" TIMESTAMP(3);

ALTER TABLE "platform_settings" ADD COLUMN "isKycRequiredForWithdrawals" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "platform_settings" ADD COLUMN "kycMinWithdrawalTokens" DECIMAL(20,8) NOT NULL DEFAULT 0;

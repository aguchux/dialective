-- CreateEnum
CREATE TYPE "KycEvidenceKind" AS ENUM ('DOCUMENT_FRONT', 'DOCUMENT_BACK', 'SELFIE_FRAME');

-- AlterTable: new self-hosted DLKYC settings, all off by default
ALTER TABLE "platform_settings"
  ADD COLUMN "selfHostedKycEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "activeKycProvider" TEXT NOT NULL DEFAULT 'didit',
  ADD COLUMN "selfHostedKycAutoApproveEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "selfHostedKycBotEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "selfHostedKycBotProviderOrder" TEXT NOT NULL DEFAULT 'openai,anthropic,deepseek',
  ADD COLUMN "selfHostedKycDocumentTypes" TEXT NOT NULL DEFAULT 'passport,national_id';

-- CreateTable
CREATE TABLE "kyc_capture_evidence" (
    "id" TEXT NOT NULL,
    "kycVerificationId" TEXT NOT NULL,
    "kind" "KycEvidenceKind" NOT NULL,
    "bucket" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kyc_capture_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "kyc_capture_evidence_kycVerificationId_idx" ON "kyc_capture_evidence"("kycVerificationId");

-- AddForeignKey
ALTER TABLE "kyc_capture_evidence" ADD CONSTRAINT "kyc_capture_evidence_kycVerificationId_fkey" FOREIGN KEY ("kycVerificationId") REFERENCES "kyc_verifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

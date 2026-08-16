-- AlterEnum
ALTER TYPE "OtpPurpose" ADD VALUE 'P2P_TRADE';

-- AlterTable
ALTER TABLE "platform_settings" ADD COLUMN "phoneVerificationRequired" BOOLEAN NOT NULL DEFAULT true;

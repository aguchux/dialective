-- AlterTable
ALTER TABLE "platform_settings" ADD COLUMN "kycAutoCancelStaleEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "platform_settings" ADD COLUMN "kycAutoCancelStaleMinutes" INTEGER NOT NULL DEFAULT 60;

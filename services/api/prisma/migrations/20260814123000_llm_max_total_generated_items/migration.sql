-- AlterTable
ALTER TABLE "platform_settings"
ADD COLUMN "llmMaxTotalGeneratedItems" INTEGER NOT NULL DEFAULT 5000;

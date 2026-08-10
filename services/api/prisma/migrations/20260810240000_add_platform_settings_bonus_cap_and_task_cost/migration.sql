-- AlterTable
ALTER TABLE "platform_settings"
  ADD COLUMN "trainingPayoutBonusCapMultiple" DECIMAL(5,2),
  ADD COLUMN "taskTokenCost" DECIMAL(20,8);

-- AlterTable
ALTER TABLE "platform_settings" ADD COLUMN     "sessionIdleTimeoutMinutes" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "sessionMaxHours" INTEGER NOT NULL DEFAULT 12;

-- AlterEnum
ALTER TYPE "LedgerEntryType" ADD VALUE 'ADMIN_FUNDING';
ALTER TYPE "LedgerEntryType" ADD VALUE 'STARTUP_BONUS';

-- AlterTable
ALTER TABLE "platform_settings" ADD COLUMN "startupBonusAmount" DECIMAL(20,8);

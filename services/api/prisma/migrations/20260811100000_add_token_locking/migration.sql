-- AlterEnum
ALTER TYPE "LedgerEntryType" ADD VALUE 'TASK_LOCK';
ALTER TYPE "LedgerEntryType" ADD VALUE 'TASK_REFUND';

-- AlterTable
ALTER TABLE "wallets" ADD COLUMN "lockedBalance" DECIMAL(20,8) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "submissions" ADD COLUMN "refundedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "word_recordings" ADD COLUMN "refundedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "platform_settings" ADD COLUMN "wordStuckTimeoutHours" INTEGER NOT NULL DEFAULT 24;

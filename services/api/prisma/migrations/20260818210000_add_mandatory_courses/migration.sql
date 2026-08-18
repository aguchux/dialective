-- AlterTable
ALTER TABLE "courses" ADD COLUMN "required" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "courses" ADD COLUMN "completionRewardTokens" DECIMAL(20,8);

-- AlterEnum
ALTER TYPE "LedgerEntryType" ADD VALUE 'COURSE_COMPLETION_REWARD';

-- CreateIndex
CREATE INDEX "courses_status_required_idx" ON "courses"("status", "required");

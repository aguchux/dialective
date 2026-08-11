-- AlterTable
ALTER TABLE "word_recordings"
ADD COLUMN "status" "SubmissionStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN "tokensSpent" DECIMAL(20,8) NOT NULL DEFAULT 0,
ADD COLUMN "score" DECIMAL(5,2),
ADD COLUMN "payoutTokenAmount" DECIMAL(20,8),
ADD COLUMN "scoredAt" TIMESTAMP(3),
ADD COLUMN "settledAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "word_recordings_status_idx" ON "word_recordings"("status");

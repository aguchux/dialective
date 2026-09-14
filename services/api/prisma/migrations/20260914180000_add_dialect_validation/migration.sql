-- CreateEnum
CREATE TYPE "ValidatorTier" AS ENUM ('TRAINER', 'L1', 'L2', 'L3');

-- CreateEnum
CREATE TYPE "WordValidationFlag" AS ENUM ('WRONG_DIALECT', 'NO_AUDIO', 'UNCLEAR_NOISY', 'MULTIPLE_SPEAKERS', 'NO_WORD_MATCH', 'TOO_FAST', 'TOO_SLOW');

-- AlterTable
ALTER TABLE "word_recordings" ADD COLUMN     "wrongDialectFlagCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "misplacedDialectAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "platform_settings" ADD COLUMN     "dialectValidationTaskEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "dialectValidationPayoutTokens" DECIMAL(20,8),
ADD COLUMN     "misplacedDialectFlagThreshold" INTEGER NOT NULL DEFAULT 3;

-- CreateTable
CREATE TABLE "word_validations" (
    "id" TEXT NOT NULL,
    "recordingId" TEXT NOT NULL,
    "validatorId" TEXT NOT NULL,
    "tier" "ValidatorTier" NOT NULL DEFAULT 'TRAINER',
    "selectedWordId" TEXT,
    "isCorrectMatch" BOOLEAN,
    "transcript" TEXT,
    "flags" "WordValidationFlag"[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "word_validations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "word_validations_recordingId_idx" ON "word_validations"("recordingId");

-- CreateIndex
CREATE INDEX "word_validations_validatorId_idx" ON "word_validations"("validatorId");

-- CreateIndex
CREATE UNIQUE INDEX "word_validations_recordingId_validatorId_key" ON "word_validations"("recordingId", "validatorId");

-- CreateIndex
CREATE INDEX "word_recordings_misplacedDialectAt_idx" ON "word_recordings"("misplacedDialectAt");

-- AddForeignKey
ALTER TABLE "word_validations" ADD CONSTRAINT "word_validations_recordingId_fkey" FOREIGN KEY ("recordingId") REFERENCES "word_recordings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "word_validations" ADD CONSTRAINT "word_validations_validatorId_fkey" FOREIGN KEY ("validatorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "word_validations" ADD CONSTRAINT "word_validations_selectedWordId_fkey" FOREIGN KEY ("selectedWordId") REFERENCES "words"("id") ON DELETE SET NULL ON UPDATE CASCADE;

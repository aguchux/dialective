-- CreateEnum
CREATE TYPE "WordTrainingDirection" AS ENUM ('ENGLISH_TO_DIALECT', 'DIALECT_TO_ENGLISH');

-- CreateEnum
CREATE TYPE "RecordingNoiseRating" AS ENUM ('NOISY', 'FAIR', 'QUIET');

-- AlterTable
ALTER TABLE "platform_settings" ADD COLUMN "reverseWordTrainingEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "word_recordings"
ADD COLUMN "assignmentId" TEXT,
ADD COLUMN "direction" "WordTrainingDirection" NOT NULL DEFAULT 'ENGLISH_TO_DIALECT',
ADD COLUMN "durationMs" INTEGER,
ADD COLUMN "noiseRating" "RecordingNoiseRating",
ADD COLUMN "sessionId" TEXT,
ADD COLUMN "userId" TEXT,
ADD COLUMN "validationScore" DECIMAL(5,4);

-- CreateTable
CREATE TABLE "training_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "termsVersion" TEXT NOT NULL,
    "consentedAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    CONSTRAINT "training_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "word_training_assignments" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "wordId" TEXT NOT NULL,
    "direction" "WordTrainingDirection" NOT NULL,
    "sourceRecordingId" TEXT,
    "uploadBucket" TEXT,
    "uploadKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "consumedAt" TIMESTAMP(3),
    CONSTRAINT "word_training_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "training_sessions_userId_startedAt_idx" ON "training_sessions"("userId", "startedAt");
CREATE INDEX "word_training_assignments_sessionId_createdAt_idx" ON "word_training_assignments"("sessionId", "createdAt");
CREATE INDEX "word_training_assignments_sourceRecordingId_idx" ON "word_training_assignments"("sourceRecordingId");
CREATE UNIQUE INDEX "word_recordings_assignmentId_key" ON "word_recordings"("assignmentId");
CREATE INDEX "word_recordings_userId_createdAt_idx" ON "word_recordings"("userId", "createdAt");
CREATE INDEX "word_recordings_sessionId_idx" ON "word_recordings"("sessionId");

-- AddForeignKey
ALTER TABLE "training_sessions" ADD CONSTRAINT "training_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "word_training_assignments" ADD CONSTRAINT "word_training_assignments_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "training_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "word_training_assignments" ADD CONSTRAINT "word_training_assignments_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "words"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "word_recordings" ADD CONSTRAINT "word_recordings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "word_recordings" ADD CONSTRAINT "word_recordings_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "training_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "word_recordings" ADD CONSTRAINT "word_recordings_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "word_training_assignments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

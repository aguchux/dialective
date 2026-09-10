-- CreateEnum
CREATE TYPE "AsrTranscriptionRequestStatus" AS ENUM ('PENDING', 'ACKNOWLEDGED', 'FULFILLED');

-- CreateTable
CREATE TABLE "asr_transcription_requests" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dialectId" TEXT NOT NULL,
    "status" "AsrTranscriptionRequestStatus" NOT NULL DEFAULT 'PENDING',
    "acknowledgedByAdminId" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asr_transcription_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "asr_transcription_requests_userId_dialectId_key" ON "asr_transcription_requests"("userId", "dialectId");
CREATE INDEX "asr_transcription_requests_status_createdAt_idx" ON "asr_transcription_requests"("status", "createdAt");
CREATE INDEX "asr_transcription_requests_dialectId_status_idx" ON "asr_transcription_requests"("dialectId", "status");

-- AddForeignKey
ALTER TABLE "asr_transcription_requests" ADD CONSTRAINT "asr_transcription_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "asr_transcription_requests" ADD CONSTRAINT "asr_transcription_requests_dialectId_fkey" FOREIGN KEY ("dialectId") REFERENCES "dialects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "asr_transcription_requests" ADD CONSTRAINT "asr_transcription_requests_acknowledgedByAdminId_fkey" FOREIGN KEY ("acknowledgedByAdminId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

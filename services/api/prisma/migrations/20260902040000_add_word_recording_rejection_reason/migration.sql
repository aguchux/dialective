-- Adds the missing reject path for WordRecording, mirroring
-- Submission.rejectionReason. Purely additive (nullable column).
ALTER TABLE "word_recordings" ADD COLUMN "rejectionReason" TEXT;

-- ASR transcription for word-training recordings (ENGLISH_TO_DIALECT /
-- DIALECT_TO_ENGLISH), used as an opt-in scoring signal alongside the
-- existing quality-gate blend. Ships inert: qualityWeightAsrMatch defaults
-- to 0 so no existing payout behavior changes until an admin opts in.

ALTER TABLE "word_recordings"
  ADD COLUMN "transcript" TEXT,
  ADD COLUMN "asrEngine" TEXT,
  ADD COLUMN "asrConfidence" DECIMAL(5,4),
  ADD COLUMN "asrWordDetail" JSONB,
  ADD COLUMN "asrMatchScore" DECIMAL(5,2);

ALTER TABLE "platform_settings"
  ADD COLUMN "qualityWeightAsrMatch" DECIMAL(5,2) NOT NULL DEFAULT 0;

-- Length-aware recording duration settings for the dictation (Submission)
-- flow, mirroring the existing wordTrainingRecordingTimeoutSeconds pattern.

ALTER TABLE "platform_settings"
  ADD COLUMN "dictationRecordingTimeoutSeconds" INTEGER,
  ADD COLUMN "dictationRecordingMaxTimeoutSeconds" INTEGER;

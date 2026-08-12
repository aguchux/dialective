-- Submission: quality-gate scores
ALTER TABLE "submissions" ADD COLUMN "noiseScore" DECIMAL(5,2);
ALTER TABLE "submissions" ADD COLUMN "qualityScore" DECIMAL(5,2);
ALTER TABLE "submissions" ADD COLUMN "livenessScore" DECIMAL(5,2);
ALTER TABLE "submissions" ADD COLUMN "compositeScore" DECIMAL(5,2);
ALTER TABLE "submissions" ADD COLUMN "qualityGateCheckedAt" TIMESTAMP(3);

-- WordRecording: quality-gate scores
ALTER TABLE "word_recordings" ADD COLUMN "noiseScore" DECIMAL(5,2);
ALTER TABLE "word_recordings" ADD COLUMN "qualityScore" DECIMAL(5,2);
ALTER TABLE "word_recordings" ADD COLUMN "livenessScore" DECIMAL(5,2);
ALTER TABLE "word_recordings" ADD COLUMN "compositeScore" DECIMAL(5,2);
ALTER TABLE "word_recordings" ADD COLUMN "qualityGateCheckedAt" TIMESTAMP(3);

-- PlatformSettings: quality-gate enable + composite-score weights
ALTER TABLE "platform_settings" ADD COLUMN "qualityGateEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "platform_settings" ADD COLUMN "qualityWeightConsensus" DECIMAL(5,2) NOT NULL DEFAULT 60;
ALTER TABLE "platform_settings" ADD COLUMN "qualityWeightNoise" DECIMAL(5,2) NOT NULL DEFAULT 15;
ALTER TABLE "platform_settings" ADD COLUMN "qualityWeightQuality" DECIMAL(5,2) NOT NULL DEFAULT 10;
ALTER TABLE "platform_settings" ADD COLUMN "qualityWeightLiveness" DECIMAL(5,2) NOT NULL DEFAULT 15;

-- Replace the old words-per-item/phrase-tier control model with explicit
-- generation switches. Legacy columns remain for backwards compatibility;
-- application code no longer uses them to schedule generation.
ALTER TABLE "platform_settings"
  ADD COLUMN "wordGenerationEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "sentenceGenerationEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "sentenceWordCount" INTEGER NOT NULL DEFAULT 6;

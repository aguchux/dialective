-- Store the original unweighted score separately from the platform/payout score.
ALTER TABLE "submissions" ADD COLUMN "rawScore" DECIMAL(5,2);
ALTER TABLE "word_recordings" ADD COLUMN "rawScore" DECIMAL(5,2);

-- Existing scores were written before the raw/platform split, so preserve
-- their current score value as the best available original score.
UPDATE "submissions"
SET "rawScore" = "score"
WHERE "score" IS NOT NULL AND "rawScore" IS NULL;

UPDATE "word_recordings"
SET "rawScore" = "score"
WHERE "score" IS NOT NULL AND "rawScore" IS NULL;

CREATE INDEX "submissions_rawScore_idx" ON "submissions"("rawScore");
CREATE INDEX "word_recordings_rawScore_idx" ON "word_recordings"("rawScore");

-- Retires the dictation feature (Submission/Prompt/PromptWord/PromptTranslation)
-- and the SENTENCE_REBUILD/PHRASE_TO_DIALECT word-training directions,
-- replacing multi-word content with a new Sentence/SentenceTranslation
-- pair. See WordsService.nextAssignment/pickSentenceSource for the new
-- trainer-facing picker, and the schema doc comments on WordRecording/
-- WordTrainingAssignment for the new DIALECT_TO_ENGLISH redo-recording
-- mechanic. Take a database snapshot before applying this migration in
-- production -- it is destructive and not reversible.

-- 1. Delete all Submission rows. Submission.promptId is onDelete: Restrict,
--    so Prompt rows referenced by a Submission cannot be dropped until this
--    runs first. Submission/consensus-scorer's quorum scoring has no
--    replacement -- dictation is retired outright, not migrated.
DELETE FROM "submissions";

-- 2. Delete WordRecording/WordTrainingAssignment rows for the retired
--    SENTENCE_REBUILD/PHRASE_TO_DIALECT directions. Their trainers were
--    already paid/settled at the time of retirement (or refunded by the
--    normal settlement-job paths); deleting these rows does not touch
--    wallets. Deleted before the enum is narrowed below, since no row may
--    reference a value the narrowed type won't contain.
DELETE FROM "word_recordings" WHERE "direction" IN ('SENTENCE_REBUILD', 'PHRASE_TO_DIALECT');
DELETE FROM "word_training_assignments" WHERE "direction" IN ('SENTENCE_REBUILD', 'PHRASE_TO_DIALECT');

-- 3. Narrow WordTrainingDirection to the 2 remaining values. Postgres has
--    no DROP VALUE for enums, so this rebuilds the type -- every row using
--    a retired value was already deleted in step 2, so the column ALTERs
--    below are safe.
BEGIN;
CREATE TYPE "WordTrainingDirection_new" AS ENUM ('ENGLISH_TO_DIALECT', 'DIALECT_TO_ENGLISH');
ALTER TABLE "word_recordings" ALTER COLUMN "direction" DROP DEFAULT;
ALTER TABLE "word_training_assignments" ALTER COLUMN "direction" TYPE "WordTrainingDirection_new" USING ("direction"::text::"WordTrainingDirection_new");
ALTER TABLE "word_recordings" ALTER COLUMN "direction" TYPE "WordTrainingDirection_new" USING ("direction"::text::"WordTrainingDirection_new");
ALTER TYPE "WordTrainingDirection" RENAME TO "WordTrainingDirection_old";
ALTER TYPE "WordTrainingDirection_new" RENAME TO "WordTrainingDirection";
DROP TYPE "WordTrainingDirection_old";
ALTER TABLE "word_recordings" ALTER COLUMN "direction" SET DEFAULT 'ENGLISH_TO_DIALECT';
COMMIT;

-- 4. Drop foreign keys/indexes pointing at Prompt before dropping its
--    columns/table.
ALTER TABLE "prompt_words" DROP CONSTRAINT "prompt_words_promptId_fkey";
ALTER TABLE "prompt_words" DROP CONSTRAINT "prompt_words_wordId_fkey";
ALTER TABLE "prompt_translations" DROP CONSTRAINT "prompt_translations_promptId_fkey";
ALTER TABLE "submissions" DROP CONSTRAINT "submissions_userId_fkey";
ALTER TABLE "submissions" DROP CONSTRAINT "submissions_promptId_fkey";
ALTER TABLE "submissions" DROP CONSTRAINT "submissions_dialectVariantId_fkey";
ALTER TABLE "word_training_assignments" DROP CONSTRAINT "word_training_assignments_promptId_fkey";
ALTER TABLE "word_recordings" DROP CONSTRAINT "word_recordings_promptId_fkey";

DROP INDEX "word_training_assignments_promptId_idx";
DROP INDEX "word_recordings_promptId_idx";

-- 5. Drop columns/tables that only ever existed to support Prompt/
--    PromptWord/SENTENCE_REBUILD, plus the now-unused dictation/
--    SENTENCE_REBUILD-only-mode settings toggles.
ALTER TABLE "word_training_assignments" DROP COLUMN "promptId",
ADD COLUMN     "sentenceId" TEXT;

ALTER TABLE "word_recordings" DROP COLUMN "promptId",
DROP COLUMN "submittedOrder",
ADD COLUMN     "redoOfRecordingId" TEXT,
ADD COLUMN     "sentenceId" TEXT;

ALTER TABLE "platform_settings" DROP COLUMN "dictationRecordingMaxTimeoutSeconds",
DROP COLUMN "dictationRecordingTimeoutSeconds",
DROP COLUMN "sentenceRebuildEnabled",
DROP COLUMN "singleWordTrainingEnabled";

DROP TABLE "prompts";
DROP TABLE "prompt_words";
DROP TABLE "prompt_translations";
DROP TABLE "submissions";
DROP TYPE "PromptOrigin";

-- 6. Create Sentence/SentenceTranslation, and wire the new dual-nullable
--    FKs (mirroring the existing wordId pattern) on WordRecording/
--    WordTrainingAssignment.
CREATE TABLE "sentences" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "wordCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sentences_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sentence_translations" (
    "id" TEXT NOT NULL,
    "sentenceId" TEXT NOT NULL,
    "dialectTag" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sentence_translations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sentences_text_key" ON "sentences"("text");
CREATE INDEX "sentences_wordCount_idx" ON "sentences"("wordCount");
CREATE INDEX "sentence_translations_dialectTag_idx" ON "sentence_translations"("dialectTag");
CREATE UNIQUE INDEX "sentence_translations_sentenceId_dialectTag_key" ON "sentence_translations"("sentenceId", "dialectTag");
CREATE INDEX "word_training_assignments_sentenceId_idx" ON "word_training_assignments"("sentenceId");
CREATE INDEX "word_recordings_sentenceId_idx" ON "word_recordings"("sentenceId");

ALTER TABLE "sentence_translations" ADD CONSTRAINT "sentence_translations_sentenceId_fkey" FOREIGN KEY ("sentenceId") REFERENCES "sentences"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "word_training_assignments" ADD CONSTRAINT "word_training_assignments_sentenceId_fkey" FOREIGN KEY ("sentenceId") REFERENCES "sentences"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "word_recordings" ADD CONSTRAINT "word_recordings_sentenceId_fkey" FOREIGN KEY ("sentenceId") REFERENCES "sentences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

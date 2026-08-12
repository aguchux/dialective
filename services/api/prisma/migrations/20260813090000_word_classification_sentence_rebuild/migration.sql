-- PartOfSpeech enum
CREATE TYPE "PartOfSpeech" AS ENUM ('NOUN', 'VERB', 'ADJECTIVE', 'ADVERB', 'PRONOUN', 'PREPOSITION', 'CONJUNCTION', 'INTERJECTION', 'DETERMINER', 'OTHER');

-- Word / WordTranslation: part-of-speech classification
ALTER TABLE "words" ADD COLUMN "partOfSpeech" "PartOfSpeech";
ALTER TABLE "word_translations" ADD COLUMN "partOfSpeech" "PartOfSpeech";

-- WordTrainingDirection: new SENTENCE_REBUILD value
ALTER TYPE "WordTrainingDirection" ADD VALUE 'SENTENCE_REBUILD';

-- PromptWord: ordered, classified fragment sequence per Prompt/dialect
CREATE TABLE "prompt_words" (
    "id" TEXT NOT NULL,
    "promptId" TEXT NOT NULL,
    "dialectTag" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "wordId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prompt_words_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "prompt_words_promptId_dialectTag_position_key" ON "prompt_words"("promptId", "dialectTag", "position");
CREATE INDEX "prompt_words_promptId_dialectTag_idx" ON "prompt_words"("promptId", "dialectTag");

ALTER TABLE "prompt_words" ADD CONSTRAINT "prompt_words_promptId_fkey" FOREIGN KEY ("promptId") REFERENCES "prompts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "prompt_words" ADD CONSTRAINT "prompt_words_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "words"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- WordTrainingAssignment: wordId becomes optional, add promptId (SENTENCE_REBUILD points at a Prompt, not a Word)
ALTER TABLE "word_training_assignments" ALTER COLUMN "wordId" DROP NOT NULL;
ALTER TABLE "word_training_assignments" ADD COLUMN "promptId" TEXT;
CREATE INDEX "word_training_assignments_promptId_idx" ON "word_training_assignments"("promptId");
ALTER TABLE "word_training_assignments" ADD CONSTRAINT "word_training_assignments_promptId_fkey" FOREIGN KEY ("promptId") REFERENCES "prompts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- WordRecording: wordId becomes optional, add promptId (SENTENCE_REBUILD points at a
-- Prompt, not a Word); audioBucket/audioKey become optional (no mic step for
-- SENTENCE_REBUILD); add submittedOrder
ALTER TABLE "word_recordings" ALTER COLUMN "wordId" DROP NOT NULL;
ALTER TABLE "word_recordings" ADD COLUMN "promptId" TEXT;
ALTER TABLE "word_recordings" ALTER COLUMN "audioBucket" DROP NOT NULL;
ALTER TABLE "word_recordings" ALTER COLUMN "audioKey" DROP NOT NULL;
ALTER TABLE "word_recordings" ADD COLUMN "submittedOrder" INTEGER[] NOT NULL DEFAULT '{}';
CREATE INDEX "word_recordings_promptId_idx" ON "word_recordings"("promptId");
ALTER TABLE "word_recordings" ADD CONSTRAINT "word_recordings_promptId_fkey" FOREIGN KEY ("promptId") REFERENCES "prompts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- PlatformSettings: sentence-rebuild exercise enable
ALTER TABLE "platform_settings" ADD COLUMN "sentenceRebuildEnabled" BOOLEAN NOT NULL DEFAULT false;

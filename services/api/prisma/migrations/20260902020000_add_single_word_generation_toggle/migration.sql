-- Narrower gate than llmGenerationEnabled: lets an admin stop
-- word-generator-job's single-word (llmWordsPerItem=1) generation branch
-- specifically, without touching composition/phrase-tier generation.
-- Defaults true (current behavior unchanged) so this ships as a no-op.
ALTER TABLE "platform_settings" ADD COLUMN "singleWordGenerationEnabled" BOOLEAN NOT NULL DEFAULT true;

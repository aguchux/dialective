-- Admin content gates for WordsService.nextAssignment's ENGLISH_TO_DIALECT
-- fallback: wordTrainingEnabled/sentenceTrainingEnabled let an admin
-- restrict trainers to only single-word content, only sentence content, or
-- both (today's behavior). Both default true so existing deployments keep
-- serving both content types until an admin explicitly narrows it.
ALTER TABLE "platform_settings" ADD COLUMN "wordTrainingEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "platform_settings" ADD COLUMN "sentenceTrainingEnabled" BOOLEAN NOT NULL DEFAULT true;

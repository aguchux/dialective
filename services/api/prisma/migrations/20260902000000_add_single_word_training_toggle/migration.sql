-- Admin toggle to force word-training assignments away from single Words
-- and exclusively onto SENTENCE_REBUILD/PHRASE_TO_DIALECT prompts. Defaults
-- true (single-word training stays on) so this ships as a no-op.
ALTER TABLE "platform_settings" ADD COLUMN "singleWordTrainingEnabled" BOOLEAN NOT NULL DEFAULT true;

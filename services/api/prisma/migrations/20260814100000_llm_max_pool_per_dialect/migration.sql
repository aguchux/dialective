-- Gate word-generator-job's per-dialect content pool growth so it can be
-- increased gradually as each dialect's trainer base grows, rather than
-- generating unbounded new prompts/words that dilute the few active
-- trainers below what consensus quorum / peer reverse-validation needs.
ALTER TABLE "platform_settings" ADD COLUMN "llmMaxPoolPerDialect" INTEGER NOT NULL DEFAULT 50;

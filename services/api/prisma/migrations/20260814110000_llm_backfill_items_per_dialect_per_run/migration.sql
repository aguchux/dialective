-- Caps how many pre-existing English Word/Prompt rows word-generator-job may
-- translate into a single under-cap dialect per scheduled run, so a
-- newly-enabled dialect can catch up on the existing backlog instead of only
-- ever growing via the shared trickle of brand-new content.
ALTER TABLE "platform_settings" ADD COLUMN "llmBackfillItemsPerDialectPerRun" INTEGER NOT NULL DEFAULT 10;

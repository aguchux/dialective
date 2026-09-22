-- AlterEnum
-- ALTER TYPE ... ADD VALUE cannot run inside a transaction block in
-- Postgres, so this migration deliberately contains no BEGIN/COMMIT and
-- uses IF NOT EXISTS to stay idempotent on re-run.
ALTER TYPE "WebhookEventType" ADD VALUE IF NOT EXISTS 'DECK_COVERAGE_CHANGED';

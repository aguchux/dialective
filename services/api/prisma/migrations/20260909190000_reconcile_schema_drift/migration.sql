-- Reconciles pre-existing drift between schema.prisma and the migration
-- history (none introduced by this migration's own changes) so `prisma
-- migrate diff --exit-code` passes again. All three are no-op/cosmetic:
-- no application behavior changes.

-- 1) users_trainerRating_idx was added by 20260902010000_add_trainer_ratings
-- but schema.prisma never declared @@index([trainerRating]) -- drop the
-- orphaned index.
DROP INDEX IF EXISTS "users_trainerRating_idx";

-- 2) subscriber_validations.updatedAt got a DB-level DEFAULT CURRENT_TIMESTAMP
-- in 20260831150000_add_isvp_review_workflow, but schema.prisma's @updatedAt
-- expects the value to be set by Prisma at write time, not by a DB default.
-- The app always sets it on every write, so this is a no-op for existing rows.
ALTER TABLE "subscriber_validations" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- 3) organization_validation_consensus's @@unique([organizationId, recordingId])
-- index name as originally created (20260830150000) is
-- organization_validation_consensus_organizationId_recordingId_key, which
-- Postgres silently truncated to 63 bytes on creation. The current Prisma
-- client computes a byte-identical truncation with a different suffix.
-- Renaming aligns the catalog name with what `prisma migrate diff` expects
-- -- the index itself (columns, uniqueness) is unchanged.
ALTER INDEX "organization_validation_consensus_organizationId_recordingId_ke"
RENAME TO "organization_validation_consensus_organizationId_recordingI_key";

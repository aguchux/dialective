-- AlterEnum
-- ALTER TYPE ... ADD VALUE cannot run inside the same transaction as a
-- statement that uses the new value, and Prisma always wraps a migration's
-- statements in one transaction unless told otherwise -- see the Phase 0
-- migration (20260908120000_add_validator_role) for the same pattern used
-- for Role.VALIDATOR.
ALTER TYPE "LedgerEntryType" ADD VALUE 'VALIDATION_REWARD';

-- AlterTable
ALTER TABLE "platform_settings" ADD COLUMN "validatorL1ApprovalBonusPercent" DECIMAL(5,2) NOT NULL DEFAULT 5;
ALTER TABLE "platform_settings" ADD COLUMN "validatorL2ApprovalBonusPercent" DECIMAL(5,2) NOT NULL DEFAULT 10;
ALTER TABLE "platform_settings" ADD COLUMN "validatorL3ApprovalBonusPercent" DECIMAL(5,2) NOT NULL DEFAULT 15;
ALTER TABLE "platform_settings" ADD COLUMN "validatorReassignmentPenaltyPercent" DECIMAL(5,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "validator_decks" ADD COLUMN "publishedStreamDeckId" TEXT;
ALTER TABLE "validator_decks" ADD COLUMN "publishedAt" TIMESTAMP(3);
ALTER TABLE "validator_decks" ADD COLUMN "reassignedFromUserId" TEXT;
ALTER TABLE "validator_decks" ADD COLUMN "reassignedAt" TIMESTAMP(3);
ALTER TABLE "validator_decks" ADD COLUMN "effectiveReassignmentPenaltyPercent" DECIMAL(5,2);

-- CreateIndex
CREATE UNIQUE INDEX "validator_decks_publishedStreamDeckId_key" ON "validator_decks"("publishedStreamDeckId");

-- Seed the reserved "Dialect Library" platform SubscriberOrganization row
-- (Phase 3's StreamDeck bridge target -- see docs/validators.md and the plan's
-- "Confirmed product decisions" #5). Fixed id so application code can
-- reference it by a constant; idempotent via ON CONFLICT DO NOTHING so this
-- migration is safe to have run more than once (e.g. a restored/replayed
-- migration history) and so a future re-seed attempt from application code
-- never errors. stripeCustomerId stays NULL -- this org never bills.
INSERT INTO "subscriber_organizations" ("id", "name", "slug", "createdAt")
VALUES ('dialect-library-platform', 'Dialect Library', 'dialect-library', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

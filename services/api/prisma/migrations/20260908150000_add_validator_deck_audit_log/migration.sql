-- CreateEnum
CREATE TYPE "ValidatorDeckAuditAction" AS ENUM ('CREATED', 'ITEM_ADDED', 'ITEM_REMOVED', 'SUBMITTED', 'RESUBMITTED', 'APPROVED', 'REJECTED', 'ADMIN_BYPASS_APPROVED', 'PUBLISHED', 'REASSIGNED', 'CLONED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "validator_deck_audit_logs" (
    "id" TEXT NOT NULL,
    "deckId" TEXT NOT NULL,
    "action" "ValidatorDeckAuditAction" NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "fromStatus" "ValidatorDeckStatus",
    "toStatus" "ValidatorDeckStatus",
    "reason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "validator_deck_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "validator_deck_audit_logs_deckId_createdAt_idx" ON "validator_deck_audit_logs"("deckId", "createdAt");
CREATE INDEX "validator_deck_audit_logs_actorUserId_idx" ON "validator_deck_audit_logs"("actorUserId");

-- AddForeignKey
ALTER TABLE "validator_deck_audit_logs"
ADD CONSTRAINT "validator_deck_audit_logs_deckId_fkey"
FOREIGN KEY ("deckId") REFERENCES "validator_decks"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "validator_deck_audit_logs"
ADD CONSTRAINT "validator_deck_audit_logs_actorUserId_fkey"
FOREIGN KEY ("actorUserId") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

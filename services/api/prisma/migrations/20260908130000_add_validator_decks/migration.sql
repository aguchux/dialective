-- AlterTable
ALTER TABLE "platform_settings" ADD COLUMN "validationRewardPerRecording" DECIMAL(20,8) NOT NULL DEFAULT 0;
ALTER TABLE "platform_settings" ADD COLUMN "validatorDeckMaxItems" INTEGER NOT NULL DEFAULT 2000;

-- CreateEnum
CREATE TYPE "ValidatorDeckStatus" AS ENUM ('DRAFT', 'PENDING_L2', 'PENDING_L3', 'PENDING_ADMIN', 'APPROVED', 'PUBLISHED', 'REJECTED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ValidatorItemStatus" AS ENUM ('UNSCORED', 'VALID', 'INVALID', 'REJECTED');

-- CreateTable
CREATE TABLE "validator_decks" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "status" "ValidatorDeckStatus" NOT NULL DEFAULT 'DRAFT',
    "dialectTag" TEXT,
    "countryCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "validator_decks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "validator_deck_items" (
    "id" TEXT NOT NULL,
    "deckId" TEXT NOT NULL,
    "recordingId" TEXT NOT NULL,
    "addedByUserId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validationStatus" "ValidatorItemStatus" NOT NULL DEFAULT 'UNSCORED',
    "validatorScore" DECIMAL(5,2),
    "validatorNotes" TEXT,
    "scoredAt" TIMESTAMP(3),

    CONSTRAINT "validator_deck_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "validator_decks_ownerUserId_idx" ON "validator_decks"("ownerUserId");
CREATE INDEX "validator_decks_createdByUserId_idx" ON "validator_decks"("createdByUserId");
CREATE INDEX "validator_decks_status_idx" ON "validator_decks"("status");

-- CreateIndex
CREATE UNIQUE INDEX "validator_deck_items_deckId_recordingId_key" ON "validator_deck_items"("deckId", "recordingId");
CREATE INDEX "validator_deck_items_deckId_idx" ON "validator_deck_items"("deckId");
CREATE INDEX "validator_deck_items_recordingId_idx" ON "validator_deck_items"("recordingId");

-- AddForeignKey
ALTER TABLE "validator_decks"
ADD CONSTRAINT "validator_decks_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "validator_decks"
ADD CONSTRAINT "validator_decks_ownerUserId_fkey"
FOREIGN KEY ("ownerUserId") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "validator_deck_items"
ADD CONSTRAINT "validator_deck_items_deckId_fkey"
FOREIGN KEY ("deckId") REFERENCES "validator_decks"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

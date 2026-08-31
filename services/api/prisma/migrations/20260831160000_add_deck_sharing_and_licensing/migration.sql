-- CreateEnum
CREATE TYPE "StreamDeckVisibility" AS ENUM ('PRIVATE', 'PUBLIC');

-- AlterTable
ALTER TABLE "stream_decks" ADD COLUMN "visibility" "StreamDeckVisibility" NOT NULL DEFAULT 'PRIVATE';

-- CreateIndex
CREATE INDEX "stream_decks_visibility_idx" ON "stream_decks"("visibility");

-- CreateTable
CREATE TABLE "deck_licenses" (
    "id" TEXT NOT NULL,
    "deckId" TEXT NOT NULL,
    "termsSummary" TEXT NOT NULL,
    "attributionRequired" BOOLEAN NOT NULL DEFAULT false,
    "redistributionAllowed" BOOLEAN NOT NULL DEFAULT false,
    "createdByUserId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deck_licenses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "deck_licenses_deckId_key" ON "deck_licenses"("deckId");

-- AddForeignKey
ALTER TABLE "deck_licenses" ADD CONSTRAINT "deck_licenses_deckId_fkey" FOREIGN KEY ("deckId") REFERENCES "stream_decks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "deck_license_acceptances" (
    "id" TEXT NOT NULL,
    "licenseId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "acceptedByUserId" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deck_license_acceptances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "deck_license_acceptances_licenseId_organizationId_key" ON "deck_license_acceptances"("licenseId", "organizationId");

-- AddForeignKey
ALTER TABLE "deck_license_acceptances" ADD CONSTRAINT "deck_license_acceptances_licenseId_fkey" FOREIGN KEY ("licenseId") REFERENCES "deck_licenses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deck_license_acceptances" ADD CONSTRAINT "deck_license_acceptances_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "subscriber_organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "validation_queue_items" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "recordingId" TEXT NOT NULL,
    "sourceDeckId" TEXT,
    "addedByUserId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "validation_queue_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "validation_queue_items_organizationId_idx" ON "validation_queue_items"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "validation_queue_items_organizationId_recordingId_key" ON "validation_queue_items"("organizationId", "recordingId");

-- AddForeignKey
ALTER TABLE "validation_queue_items" ADD CONSTRAINT "validation_queue_items_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "subscriber_organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Dialect Library Voice Stream -- Phase 4a (Deck Versioning & Curation).
-- Stream Deck versions, snapshots, Smart Decks with saved rules, and the
-- change feed.

CREATE TYPE "StreamDeckType" AS ENUM ('MANUAL', 'SMART');

ALTER TABLE "stream_decks" ADD COLUMN "type" "StreamDeckType" NOT NULL DEFAULT 'MANUAL';

CREATE TABLE "stream_deck_rules" (
    "id" TEXT NOT NULL,
    "deckId" TEXT NOT NULL,
    "countryCode" TEXT,
    "dialectTag" TEXT,
    "subdialectTag" TEXT,
    "minScore" INTEGER,
    "minIsvs" INTEGER,
    "minConfidence" "IsvcConfidence",
    "minOrganizationCount" INTEGER,
    "minAudioQuality" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stream_deck_rules_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "stream_deck_rules_deckId_key" ON "stream_deck_rules"("deckId");

CREATE TABLE "stream_deck_versions" (
    "id" TEXT NOT NULL,
    "deckId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "itemCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdReason" TEXT NOT NULL,

    CONSTRAINT "stream_deck_versions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "stream_deck_versions_deckId_version_key" ON "stream_deck_versions"("deckId", "version");

CREATE INDEX "stream_deck_versions_deckId_idx" ON "stream_deck_versions"("deckId");

CREATE TABLE "stream_deck_version_items" (
    "id" TEXT NOT NULL,
    "deckVersionId" TEXT NOT NULL,
    "recordingId" TEXT NOT NULL,
    "durationMs" INTEGER,
    "dialectTag" TEXT NOT NULL,
    "subdialectTag" TEXT,
    "dlCanonicalScore" DECIMAL(5,2),
    "isvs" DECIMAL(5,2),
    "isvcVersion" INTEGER,

    CONSTRAINT "stream_deck_version_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "stream_deck_version_items_deckVersionId_recordingId_key" ON "stream_deck_version_items"("deckVersionId", "recordingId");

CREATE INDEX "stream_deck_version_items_deckVersionId_idx" ON "stream_deck_version_items"("deckVersionId");

CREATE TABLE "stream_deck_current_versions" (
    "deckId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,

    CONSTRAINT "stream_deck_current_versions_pkey" PRIMARY KEY ("deckId")
);

CREATE UNIQUE INDEX "stream_deck_current_versions_versionId_key" ON "stream_deck_current_versions"("versionId");

ALTER TABLE "stream_deck_rules" ADD CONSTRAINT "stream_deck_rules_deckId_fkey" FOREIGN KEY ("deckId") REFERENCES "stream_decks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "stream_deck_versions" ADD CONSTRAINT "stream_deck_versions_deckId_fkey" FOREIGN KEY ("deckId") REFERENCES "stream_decks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "stream_deck_version_items" ADD CONSTRAINT "stream_deck_version_items_deckVersionId_fkey" FOREIGN KEY ("deckVersionId") REFERENCES "stream_deck_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "stream_deck_current_versions" ADD CONSTRAINT "stream_deck_current_versions_deckId_fkey" FOREIGN KEY ("deckId") REFERENCES "stream_decks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "stream_deck_current_versions" ADD CONSTRAINT "stream_deck_current_versions_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "stream_deck_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

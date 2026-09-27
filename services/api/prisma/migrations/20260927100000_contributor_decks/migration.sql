-- Contributor dialect decks, plus the per-contributor payout suppression gate.
--
-- Additive only: one new table, one new column with a safe default, one new
-- enum value. Nothing is backfilled and no existing row changes behaviour,
-- so this is a no-op for every trainer until an admin turns the gate on.

-- The per-contributor payout gate. Default FALSE, so deploying this changes
-- nothing: every trainer keeps staking and earning exactly as before.
ALTER TABLE "platform_settings"
  ADD COLUMN IF NOT EXISTS "vdclPayoutSuppressionEnabled" BOOLEAN NOT NULL DEFAULT false;

-- Step-up purpose for flipping the gate above.
ALTER TYPE "OtpPurpose" ADD VALUE IF NOT EXISTS 'VDCL_PAYOUT_SUPPRESSION_TOGGLE';

-- A contributor's licensed recordings in ONE dialect, grouped as a unit a
-- subscriber can browse. streamDeckId points at the PUBLIC StreamDeck this
-- was bridged into under the seeded 'dialect-library-platform' org.
CREATE TABLE "contributor_decks" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "dialectTag" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "streamDeckId" TEXT,
    "itemCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contributor_decks_pkey" PRIMARY KEY ("id")
);

-- One deck per contributor per dialect: membership is derived from the tag,
-- so a second deck for the same dialect would duplicate the first.
CREATE UNIQUE INDEX "contributor_decks_ownerUserId_dialectTag_key"
  ON "contributor_decks"("ownerUserId", "dialectTag");

-- One ContributorDeck can only ever back one StreamDeck.
CREATE UNIQUE INDEX "contributor_decks_streamDeckId_key"
  ON "contributor_decks"("streamDeckId");

CREATE INDEX "contributor_decks_ownerUserId_idx" ON "contributor_decks"("ownerUserId");
CREATE INDEX "contributor_decks_dialectTag_idx" ON "contributor_decks"("dialectTag");

ALTER TABLE "contributor_decks"
  ADD CONSTRAINT "contributor_decks_ownerUserId_fkey"
  FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

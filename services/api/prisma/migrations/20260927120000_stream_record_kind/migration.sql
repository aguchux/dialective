-- Multi-dataset support: a licensed, deck-held or streamed item now says WHICH
-- dataset it points at.
--
-- Every new column defaults to WORD_RECORDING, which is not a guess but the
-- historically correct value: word recordings were the only thing that could be
-- licensed, added to a deck or streamed before this existed. So no backfill is
-- needed and no existing row changes meaning.
--
-- The widened unique constraints are the point of the change. WordRecording and
-- DomainConversationRecording have independent uuid spaces, so a key on
-- recordingId alone cannot hold both kinds: one would collide with the other
-- and be silently dropped.

CREATE TYPE "StreamRecordKind" AS ENUM ('WORD_RECORDING', 'DOMAIN_CONVERSATION_RECORDING');

-- 1. VDCL manifest items: what a licence actually covers.
ALTER TABLE "vdcl_manifest_items"
  ADD COLUMN IF NOT EXISTS "recordKind" "StreamRecordKind" NOT NULL DEFAULT 'WORD_RECORDING';

DROP INDEX IF EXISTS "vdcl_manifest_items_manifestId_recordingId_key";
CREATE UNIQUE INDEX "vdcl_manifest_items_manifestId_recordKind_recordingId_key"
  ON "vdcl_manifest_items"("manifestId", "recordKind", "recordingId");

DROP INDEX IF EXISTS "vdcl_manifest_items_recordingId_idx";
CREATE INDEX "vdcl_manifest_items_recordKind_recordingId_idx"
  ON "vdcl_manifest_items"("recordKind", "recordingId");

-- 2. Stream deck membership, live and versioned.
ALTER TABLE "stream_deck_items"
  ADD COLUMN IF NOT EXISTS "recordKind" "StreamRecordKind" NOT NULL DEFAULT 'WORD_RECORDING';

DROP INDEX IF EXISTS "stream_deck_items_deckId_recordingId_key";
CREATE UNIQUE INDEX "stream_deck_items_deckId_recordKind_recordingId_key"
  ON "stream_deck_items"("deckId", "recordKind", "recordingId");

ALTER TABLE "stream_deck_version_items"
  ADD COLUMN IF NOT EXISTS "recordKind" "StreamRecordKind" NOT NULL DEFAULT 'WORD_RECORDING';

DROP INDEX IF EXISTS "stream_deck_version_items_deckVersionId_recordingId_key";
CREATE UNIQUE INDEX "stream_deck_version_items_deckVersionId_recordKind_recordin_key"
  ON "stream_deck_version_items"("deckVersionId", "recordKind", "recordingId");

-- Index names below are the ones Prisma generates, including its truncation at
-- Postgres's 63-character identifier limit -- writing the untruncated name here
-- would create an index the schema does not expect and show as permanent drift.
--
-- 3. Access log: nullable, because a manifest or usage request is not about one
-- record. The composite index is for the revenue-sharing rollup, which reads
-- one organisation's allowed audio requests for a period and groups them per
-- record -- without it that is a full scan of an append-only table.
ALTER TABLE "stream_access_logs"
  ADD COLUMN IF NOT EXISTS "recordKind" "StreamRecordKind";

CREATE INDEX "stream_access_logs_organizationId_createdAt_recordKind_reco_idx"
  ON "stream_access_logs"("organizationId", "createdAt", "recordKind", "recordingId");

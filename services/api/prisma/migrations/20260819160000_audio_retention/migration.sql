-- Admin-configurable audio retention/deletion ("Dataset & Storage").
-- Audio-only: never deletes rows, transcripts, or scores.

ALTER TABLE "submissions"
  ALTER COLUMN "audioBucket" DROP NOT NULL,
  ALTER COLUMN "audioKey" DROP NOT NULL,
  ADD COLUMN "audioDeletedAt" TIMESTAMP(3);

ALTER TABLE "word_recordings" ADD COLUMN "audioDeletedAt" TIMESTAMP(3);

CREATE TABLE "audio_retention_rules" (
  "id" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "countryId" TEXT,
  "dialectTag" TEXT,
  "retentionDays" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "audio_retention_rules_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "audio_retention_rules_countryId_dialectTag_idx" ON "audio_retention_rules"("countryId", "dialectTag");

ALTER TABLE "audio_retention_rules"
  ADD CONSTRAINT "audio_retention_rules_countryId_fkey"
  FOREIGN KEY ("countryId") REFERENCES "countries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

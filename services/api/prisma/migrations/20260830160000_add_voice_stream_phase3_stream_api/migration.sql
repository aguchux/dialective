-- Dialect Library Voice Stream -- Phase 3 (Voice Stream API).
-- Stream Keys (deck-scoped or org-wide), audio streaming with Range
-- support, manifest/metadata/usage endpoints, and append-only access
-- logging for external/programmatic clients.

CREATE TYPE "StreamKeyScope" AS ENUM ('DECK_READ', 'DECK_LIST', 'AUDIO_STREAM', 'METADATA_READ', 'MANIFEST_READ', 'USAGE_READ');

ALTER TABLE "subscription_plans" ADD COLUMN "maxConcurrentStreams" INTEGER;
ALTER TABLE "subscription_plans" ADD COLUMN "rateLimitPerMinute" INTEGER;

CREATE TABLE "stream_api_keys" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "deckId" TEXT,
    "keyHash" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "scopes" "StreamKeyScope"[],
    "allowedIps" TEXT[] NOT NULL DEFAULT '{}',
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "stream_api_keys_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "stream_api_keys_keyHash_key" ON "stream_api_keys"("keyHash");

CREATE INDEX "stream_api_keys_organizationId_idx" ON "stream_api_keys"("organizationId");

CREATE INDEX "stream_api_keys_deckId_idx" ON "stream_api_keys"("deckId");

CREATE TABLE "stream_access_logs" (
    "id" TEXT NOT NULL,
    "streamApiKeyId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "deckId" TEXT,
    "recordingId" TEXT,
    "requestType" TEXT NOT NULL,
    "requestedRange" TEXT,
    "bytesStreamed" BIGINT,
    "resultCode" INTEGER NOT NULL,
    "entitlementDecision" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stream_access_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "stream_access_logs_streamApiKeyId_createdAt_idx" ON "stream_access_logs"("streamApiKeyId", "createdAt");

CREATE INDEX "stream_access_logs_organizationId_createdAt_idx" ON "stream_access_logs"("organizationId", "createdAt");

ALTER TABLE "stream_api_keys" ADD CONSTRAINT "stream_api_keys_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "subscriber_organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "stream_api_keys" ADD CONSTRAINT "stream_api_keys_deckId_fkey" FOREIGN KEY ("deckId") REFERENCES "stream_decks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "stream_access_logs" ADD CONSTRAINT "stream_access_logs_streamApiKeyId_fkey" FOREIGN KEY ("streamApiKeyId") REFERENCES "stream_api_keys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

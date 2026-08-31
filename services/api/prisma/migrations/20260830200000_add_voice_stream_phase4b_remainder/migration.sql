-- Dialect Library Voice Stream -- Phase 4b remainder (OAuth M2M, advanced
-- audit exports, anomaly detection, advanced quota policies).

-- Relax stream_access_logs.streamApiKeyId from a hard FK into a loose
-- reference: OAuth M2M clients (new OAuthClient table below) authenticate
-- the same /stream/v1/* routes and write audit rows into this same table,
-- so a hard FK to stream_api_keys alone would reject every
-- OAuth-authenticated request's audit log write. credentialType
-- disambiguates which table the id actually points into.
ALTER TABLE "stream_access_logs" DROP CONSTRAINT "stream_access_logs_streamApiKeyId_fkey";
ALTER TABLE "stream_access_logs" ADD COLUMN "credentialType" TEXT NOT NULL DEFAULT 'stream_key';

-- OAuth M2M (client_credentials grant issuing short-lived JWTs, coexisting
-- with Stream Keys).
CREATE TABLE "oauth_clients" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "deckId" TEXT,
    "clientId" TEXT NOT NULL,
    "secretHash" TEXT NOT NULL,
    "scopes" "StreamKeyScope"[],
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "oauth_clients_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "oauth_clients_clientId_key" ON "oauth_clients"("clientId");

CREATE INDEX "oauth_clients_organizationId_idx" ON "oauth_clients"("organizationId");

ALTER TABLE "oauth_clients" ADD CONSTRAINT "oauth_clients_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "subscriber_organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Advanced audit exports -- org-activity timeline.
CREATE TYPE "ActivityEventType" AS ENUM ('KEY_CREATED', 'KEY_ROTATED', 'KEY_REVOKED', 'OAUTH_CLIENT_CREATED', 'OAUTH_CLIENT_REVOKED', 'MEMBER_INVITED', 'MEMBER_ROLE_CHANGED', 'MEMBER_REMOVED', 'SUBSCRIPTION_PLAN_CHANGED');

CREATE TABLE "org_activity_events" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eventType" "ActivityEventType" NOT NULL,
    "actorUserId" TEXT,
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "org_activity_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "org_activity_events_organizationId_createdAt_idx" ON "org_activity_events"("organizationId", "createdAt");

ALTER TABLE "org_activity_events" ADD CONSTRAINT "org_activity_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "subscriber_organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Anomaly detection.
ALTER TYPE "WebhookEventType" ADD VALUE 'ANOMALY_DETECTED';

CREATE TABLE "anomaly_events" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ruleKey" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "windowEnd" TIMESTAMP(3) NOT NULL,
    "details" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "anomaly_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "anomaly_events_organizationId_createdAt_idx" ON "anomaly_events"("organizationId", "createdAt");

ALTER TABLE "anomaly_events" ADD CONSTRAINT "anomaly_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "subscriber_organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Advanced quota policies.
ALTER TABLE "subscription_plans" ADD COLUMN "monthlyByteQuota" BIGINT;
ALTER TABLE "subscription_plans" ADD COLUMN "monthlyRequestQuota" INTEGER;

CREATE TABLE "usage_counters" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "bytesUsed" BIGINT NOT NULL DEFAULT 0,
    "requestsUsed" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "usage_counters_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "usage_counters_organizationId_periodStart_key" ON "usage_counters"("organizationId", "periodStart");

ALTER TABLE "usage_counters" ADD CONSTRAINT "usage_counters_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "subscriber_organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

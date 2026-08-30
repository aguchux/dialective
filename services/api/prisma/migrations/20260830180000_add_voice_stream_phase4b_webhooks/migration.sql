-- Dialect Library Voice Stream -- Phase 4b (Webhooks).
-- Subscriber-configured HTTP callbacks for Voice Stream domain events.

CREATE TYPE "WebhookEventType" AS ENUM ('SUBSCRIBER_CREATED', 'SUBSCRIPTION_ACTIVATED', 'SUBSCRIPTION_PAYMENT_FAILED', 'DECK_CREATED', 'DECK_ITEM_ADDED', 'DECK_ITEM_REMOVED', 'DECK_VERSION_CREATED', 'VALIDATION_SUBMITTED', 'ISVC_VERSION_CREATED', 'API_KEY_CREATED', 'API_KEY_REVOKED', 'AUDIO_STREAM_COMPLETED', 'AUDIO_STREAM_DENIED');

CREATE TABLE "webhook_subscriptions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "eventTypes" "WebhookEventType"[],
    "encryptedSecret" TEXT NOT NULL,
    "secretIv" TEXT NOT NULL,
    "secretAuthTag" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "webhook_subscriptions_organizationId_idx" ON "webhook_subscriptions"("organizationId");

CREATE TABLE "webhook_delivery_logs" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "eventType" "WebhookEventType" NOT NULL,
    "payload" JSONB NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "resultCode" INTEGER,
    "succeeded" BOOLEAN NOT NULL,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_delivery_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "webhook_delivery_logs_subscriptionId_createdAt_idx" ON "webhook_delivery_logs"("subscriptionId", "createdAt");

ALTER TABLE "webhook_subscriptions" ADD CONSTRAINT "webhook_subscriptions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "subscriber_organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "webhook_delivery_logs" ADD CONSTRAINT "webhook_delivery_logs_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "webhook_subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

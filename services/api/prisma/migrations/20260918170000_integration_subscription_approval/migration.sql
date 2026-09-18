-- Subscribing to an integration becomes a REQUEST, not a grant.
--
-- Fulfilling an integration means handling other members' identity
-- documents and being paid for it, so who may do it is an admin decision
-- rather than a self-serve toggle. IntegrationsService.isSubscribed -- the
-- single gate every consumer goes through -- now accepts only APPROVED.

CREATE TYPE "IntegrationSubscriptionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

ALTER TABLE "integration_subscriptions"
  ADD COLUMN "status" "IntegrationSubscriptionStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "reviewedAt" TIMESTAMP(3),
  ADD COLUMN "reviewedByAdminId" TEXT,
  ADD COLUMN "reviewNote" TEXT;

-- Anyone who subscribed under the old self-serve rule keeps their access:
-- the rule changed, and silently revoking what they already had would be
-- a surprise rather than a safeguard. New requests land PENDING.
UPDATE "integration_subscriptions" SET "status" = 'APPROVED';

ALTER TABLE "integration_subscriptions"
  ADD CONSTRAINT "integration_subscriptions_reviewedByAdminId_fkey"
  FOREIGN KEY ("reviewedByAdminId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "integration_subscriptions_status_subscribedAt_idx"
  ON "integration_subscriptions"("status", "subscribedAt");

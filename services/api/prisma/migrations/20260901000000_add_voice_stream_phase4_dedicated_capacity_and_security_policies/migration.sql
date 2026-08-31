-- Dialect Library Voice Stream -- Phase 4 (dedicated capacity + enterprise
-- security policies, the final two Phase 4 items). Dedicated capacity's
-- reservation state is Redis-resident (ephemeral fleet-wide counters, not
-- persisted) -- this migration only adds the plan-level entitlement/floor
-- field. Enterprise security policies get a new 1:1-optional table mirroring
-- sso_idp_configs's shape.

ALTER TABLE "subscription_plans" ADD COLUMN "reservedCapacityPercent" INTEGER;
ALTER TABLE "subscription_plans" ADD COLUMN "enterpriseSecurityPoliciesEnabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TYPE "ActivityEventType" ADD VALUE 'SECURITY_POLICY_UPDATED';
ALTER TYPE "ActivityEventType" ADD VALUE 'SECURITY_POLICY_REMOVED';

CREATE TABLE "subscriber_org_security_policies" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "requireSso" BOOLEAN NOT NULL DEFAULT false,
    "refreshTokenTtlMinutes" INTEGER,
    "minRoleForApiKeyCreation" "SubscriberOrgRole"[] NOT NULL DEFAULT ARRAY[]::"SubscriberOrgRole"[],
    "requireIpAllowlist" BOOLEAN NOT NULL DEFAULT false,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriber_org_security_policies_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "subscriber_org_security_policies_organizationId_key" ON "subscriber_org_security_policies"("organizationId");

ALTER TABLE "subscriber_org_security_policies" ADD CONSTRAINT "subscriber_org_security_policies_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "subscriber_organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

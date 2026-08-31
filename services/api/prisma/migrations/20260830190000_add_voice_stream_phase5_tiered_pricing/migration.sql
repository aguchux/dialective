-- Dialect Library Voice Stream -- Phase 5 (Commercial Intelligence).
-- Tiered subscription pricing gated by ISVC confidence, plus an index to
-- support per-organization validation contribution reports.

ALTER TABLE "subscription_plans" ADD COLUMN "minIsvcConfidence" "IsvcConfidence";

CREATE INDEX "organization_validation_consensus_organizationId_updatedAt_idx" ON "organization_validation_consensus"("organizationId", "updatedAt");

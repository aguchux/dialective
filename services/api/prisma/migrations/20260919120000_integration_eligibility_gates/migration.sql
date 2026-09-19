-- Admin-editable eligibility gates per integration.
--
-- These three were code constants in INTEGRATION_REGISTRY. Moving them
-- into the table makes them admin-tunable alongside fee/claims/validity,
-- and the registry keeps supplying only the seed value for a brand-new
-- slug (see IntegrationsService.syncRegistry, which never overwrites
-- them on an existing row).
--
-- Columns default to the OPEN state (no bar). That is the safe default
-- for a column, but it is the wrong value for the two integrations that
-- ship today, so the backfill below immediately sets each one to the
-- rule it is already enforcing in code. Without it, this migration would
-- silently drop every gate at the moment it was applied.
ALTER TABLE "integrations"
  ADD COLUMN "requirePhoneVerified" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "requireKycApproved" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "minCompletedTasks" INTEGER NOT NULL DEFAULT 0;

-- WhatsApp Validator: identity only. A validator confirms someone else's
-- number, so they must have proven their own and be identifiable.
UPDATE "integrations"
SET "requirePhoneVerified" = true,
    "requireKycApproved" = true
WHERE "slug" = 'whatsapp-validator';

-- ID Review: identity plus a track record, because a reviewer here reads
-- other members' identity documents.
UPDATE "integrations"
SET "requirePhoneVerified" = true,
    "requireKycApproved" = true,
    "minCompletedTasks" = 100
WHERE "slug" = 'p2p-kyc-review';

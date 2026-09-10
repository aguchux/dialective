-- The subdialect-mandatory migration (20260910... "Make subdialect
-- selection mandatory; seed a Basic variant for every dialect") seeded a
-- "basic" DialectVariant for every Dialect, but never backfilled existing
-- users onto one. onboardingComplete (auth.service.ts) requires
-- dialectVariantId IS NOT NULL, so every trainer who set a dialect before
-- that change was retroactively treated as onboarding-incomplete and sent
-- back through the onboarding flow -- which, combined with onboarding's
-- unconditional KYC re-prompt (fixed separately in application code), also
-- re-surfaced identity verification for trainers who had already completed
-- it.
--
-- Backfills every TRAINER with a set dialectId but no dialectVariantId onto
-- their dialect's "basic" variant, preserving their existing dialect choice
-- rather than resetting it. Idempotent (only touches rows still NULL) and
-- safe to re-run -- matches every dialect's "basic" variant existing
-- unconditionally per the prior migration's seed.
UPDATE "users" u
SET "dialectVariantId" = dv.id
FROM "dialect_variants" dv
WHERE dv."dialectId" = u."dialectId"
  AND dv.tag = 'basic'
  AND u.role = 'TRAINER'
  AND u."dialectId" IS NOT NULL
  AND u."dialectVariantId" IS NULL;

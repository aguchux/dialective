-- VDCL Phase 3: step-up purpose for contributor signing.
--
-- ALTER TYPE ... ADD VALUE cannot run inside a transaction block in
-- Postgres, so this migration deliberately contains no BEGIN/COMMIT.
-- IF NOT EXISTS keeps it idempotent against a re-run.
ALTER TYPE "OtpPurpose" ADD VALUE IF NOT EXISTS 'VDCL_SIGN';

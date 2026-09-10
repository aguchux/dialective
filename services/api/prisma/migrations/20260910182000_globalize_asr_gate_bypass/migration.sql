-- Replace the per-dialect Dialect.asrGateBypassed override (added moments
-- ago in 20260910180000, never set on any real row) with a single global
-- switch on PlatformSettings -- the intended behavior was "bypass the ASR
-- gate for every dialect at once", not a per-dialect toggle.
ALTER TABLE "dialects" DROP COLUMN "asrGateBypassed";

ALTER TABLE "platform_settings" ADD COLUMN "asrGateGloballyBypassed" BOOLEAN NOT NULL DEFAULT false;

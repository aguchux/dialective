-- Phase 6 of docs/Stream-Revenue-Sharing-Engine.md: the per-run blast-radius
-- ceiling on royalty settlement.
--
-- A pool is priced from an FX rate, a share percent and a token rate. A mistake
-- in any of them scales every pool in a run at once and still looks like a valid
-- run, so a settlement whose total exceeds this refuses to settle ANY of it.

-- AlterTable
ALTER TABLE "platform_settings"
  ADD COLUMN "royaltyMaxRunAccrualDl" DECIMAL(20,8) NOT NULL DEFAULT 100000;

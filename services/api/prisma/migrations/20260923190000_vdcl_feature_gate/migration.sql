-- Master gate for the whole contributor-licensing feature.
--
-- Defaults to false, and the existing settings row inherits that default, so
-- VDCL goes dark the moment this is applied rather than waiting on an admin
-- to remember. That is the point: nothing may be issued to a real contributor
-- until Phase 1 legal review lands, and a gate that has to be switched off by
-- hand is not a gate.
ALTER TABLE "platform_settings"
  ADD COLUMN "vdclEnabled" BOOLEAN NOT NULL DEFAULT false;

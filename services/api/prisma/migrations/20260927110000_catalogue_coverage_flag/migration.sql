-- Whether subscriber catalogue SEARCH is narrowed to manifest-covered
-- recordings.
--
-- A separate flag from vdclEnforcementEnabled on purpose. That one is already
-- true in production, where it means an uncovered recording's AUDIO is denied
-- on request while the catalogue listing stays whole. Filtering the listing is
-- a much larger blast radius on the same signal: production currently holds
-- 191,800 settled recordings with audio and 42 covered by a VDCL manifest, so
-- reusing that flag would have emptied the subscriber catalogue.
--
-- Defaults FALSE. Turn it on once VDCL adoption covers enough of the corpus
-- for coverage to be the real gate.
ALTER TABLE "platform_settings"
  ADD COLUMN IF NOT EXISTS "vdclCatalogueCoverageFilterEnabled" BOOLEAN NOT NULL DEFAULT false;

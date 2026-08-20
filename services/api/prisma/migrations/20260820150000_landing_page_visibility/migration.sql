-- Per-card visibility toggles for the landing page's 5-stat row.
ALTER TABLE "platform_settings" ADD COLUMN "landingShowCountries" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "platform_settings" ADD COLUMN "landingShowDialects" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "platform_settings" ADD COLUMN "landingShowTrainers" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "platform_settings" ADD COLUMN "landingShowPoolVolume" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "platform_settings" ADD COLUMN "landingShowPayout" BOOLEAN NOT NULL DEFAULT true;

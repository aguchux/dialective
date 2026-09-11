-- Admin-gated Adsterra/Monetag ad network config for the Community app.
ALTER TABLE "community_settings" ADD COLUMN "adsterraEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "community_settings" ADD COLUMN "adsterraSiteId" TEXT;
ALTER TABLE "community_settings" ADD COLUMN "monetagEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "community_settings" ADD COLUMN "monetagZoneId" TEXT;

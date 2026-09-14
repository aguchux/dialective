-- Move the trainer dashboard Adsterra unit configuration into admin-managed
-- platform settings. Existing deployments remain disabled until configured.
ALTER TABLE "platform_settings"
  ADD COLUMN "trainerAdsterra728Enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "trainerAdsterra728ScriptUrl" TEXT,
  ADD COLUMN "trainerAdsterra728Key" TEXT;

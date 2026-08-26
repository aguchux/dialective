ALTER TABLE "users"
  ADD COLUMN "pwaInstalledAt" TIMESTAMP(3);

ALTER TABLE "platform_settings"
  ADD COLUMN "pwaInstallPromptEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "pwaInstallPromptReminderMinutes" INTEGER NOT NULL DEFAULT 60;

-- Admin on/off toggle for the Monday weekly-trainer-report email, checked
-- once at job start (see weekly-trainer-report.ts). Defaults true so the
-- feature is live as soon as it ships, matching pwaInstallPromptEnabled's
-- own default-on precedent.
ALTER TABLE "platform_settings" ADD COLUMN "weeklyTrainerReportEnabled" BOOLEAN NOT NULL DEFAULT true;

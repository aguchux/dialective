ALTER TABLE "platform_settings" ADD COLUMN "submissionRateLimitEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "platform_settings" ADD COLUMN "submissionRateLimitPerHour" INTEGER NOT NULL DEFAULT 120;

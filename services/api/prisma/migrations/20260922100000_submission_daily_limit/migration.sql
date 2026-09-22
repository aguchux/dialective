-- Per-trainer DAILY submission cap, complementing the existing per-hour
-- throttle (submissionRateLimitPerHour). The hourly limit stops a burst;
-- this one stops a sustained day-long run, which is what actually drives
-- the rate at which DL is minted.
--
-- Deliberately a separate toggle rather than reusing
-- submissionRateLimitEnabled: an admin may want the daily total without
-- the hourly burst limit, or vice versa.
--
-- Additive with defaults, and OFF by default, so applying this migration
-- changes no behaviour until an admin opts in from Settings.
ALTER TABLE "platform_settings"
  ADD COLUMN "submissionDailyLimitEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "submissionDailyLimitPerDay" INTEGER NOT NULL DEFAULT 200;

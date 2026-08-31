-- Allow administrators to require the QRAC affirmation before every new
-- word-training session's first assignment instead of using periodic QRAC.
ALTER TABLE "platform_settings"
ADD COLUMN "qracRequiredAtSessionStart" BOOLEAN NOT NULL DEFAULT false;

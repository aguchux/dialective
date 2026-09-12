-- AlterTable: admin toggle to route decisively-bad DLKYC scores to
-- IN_REVIEW instead of auto-DECLINE.
ALTER TABLE "platform_settings"
  ADD COLUMN "selfHostedKycDoNotAutoDeclineEnabled" BOOLEAN NOT NULL DEFAULT false;

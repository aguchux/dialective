-- AlterTable: add driver's licence to the default DLKYC accepted-document
-- allow-list, and backfill any existing PlatformSettings row that still has
-- the old default untouched by an admin -- so live deployments pick this up
-- without a manual settings edit, while a row an admin has already
-- customized (anything else) is left alone.
ALTER TABLE "platform_settings"
  ALTER COLUMN "selfHostedKycDocumentTypes" SET DEFAULT 'passport,national_id,drivers_license';

UPDATE "platform_settings"
  SET "selfHostedKycDocumentTypes" = 'passport,national_id,drivers_license'
  WHERE "selfHostedKycDocumentTypes" = 'passport,national_id';

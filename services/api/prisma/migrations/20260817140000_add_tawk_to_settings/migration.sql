-- AlterTable
ALTER TABLE "platform_settings" ADD COLUMN "tawkToEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "platform_settings" ADD COLUMN "tawkToPropertyId" TEXT;
ALTER TABLE "platform_settings" ADD COLUMN "tawkToWidgetId" TEXT;

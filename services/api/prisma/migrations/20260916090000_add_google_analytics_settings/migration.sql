-- AlterTable
ALTER TABLE "platform_settings" ADD COLUMN     "googleAnalyticsEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "googleAnalyticsMeasurementId" TEXT;

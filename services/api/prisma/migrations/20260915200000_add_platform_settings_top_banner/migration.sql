-- AlterTable
ALTER TABLE "platform_settings" ADD COLUMN     "topBannerEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "topBannerImageBucket" TEXT,
ADD COLUMN     "topBannerImageKey" TEXT,
ADD COLUMN     "topBannerAltText" TEXT,
ADD COLUMN     "topBannerLearnMoreUrl" TEXT;

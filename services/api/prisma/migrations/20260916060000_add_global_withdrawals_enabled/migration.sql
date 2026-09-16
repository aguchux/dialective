-- AlterTable
ALTER TABLE "platform_settings" ADD COLUMN     "withdrawalsEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "withdrawalsDisabledMessage" TEXT;

-- AlterTable
ALTER TABLE "platform_settings" ADD COLUMN "authMaintenanceEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "platform_settings" ADD COLUMN "authMaintenanceUntil" TIMESTAMP(3);
ALTER TABLE "platform_settings" ADD COLUMN "authMaintenanceMessage" TEXT;
ALTER TABLE "platform_settings" ADD COLUMN "authMaintenanceBlockLogin" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "platform_settings" ADD COLUMN "authMaintenanceBlockSignup" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "platform_settings" ADD COLUMN "authMaintenanceBlockSessions" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "platform_settings" ADD COLUMN "authMaintenanceExcludeAdmin" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "platform_settings" ADD COLUMN "authMaintenanceExcludePartner" BOOLEAN NOT NULL DEFAULT false;

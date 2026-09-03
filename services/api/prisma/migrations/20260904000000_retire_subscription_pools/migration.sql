-- DropForeignKey
ALTER TABLE "subscription_pools" DROP CONSTRAINT "subscription_pools_dataAccessLeadId_fkey";

-- DropForeignKey
ALTER TABLE "subscription_pools" DROP CONSTRAINT "subscription_pools_openedByUserId_fkey";

-- DropTable
DROP TABLE "subscription_pools";

-- DropEnum
DROP TYPE "SubscriptionPoolStatus";

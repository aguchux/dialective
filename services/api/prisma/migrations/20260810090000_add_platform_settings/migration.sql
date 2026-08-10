-- CreateTable
CREATE TABLE "platform_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "tokenUsdRate" DECIMAL(10,6),
    "minWithdrawalTokens" DECIMAL(20,8),
    "resendFromAddress" TEXT,
    "leadsNotificationAddress" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("id")
);

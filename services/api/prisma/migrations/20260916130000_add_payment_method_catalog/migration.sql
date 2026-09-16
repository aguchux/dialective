-- Admin-curated per-country payment method catalog (bank/mobile-money
-- display names + optional logo), used by free-entry payout account
-- creation and shown to users picking what kind of account to add.
CREATE TABLE "payment_method_catalog" (
    "id" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "type" "PayoutAccountType" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "logoKey" TEXT,
    "bankCode" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_method_catalog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "payment_method_catalog_countryCode_type_enabled_sortOrder_idx" ON "payment_method_catalog"("countryCode", "type", "enabled", "sortOrder");

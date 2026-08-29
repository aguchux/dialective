CREATE TABLE "reserve_balance_snapshots" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "balanceRaw" DECIMAL(20,8) NOT NULL,
    "balanceUsd" DECIMAL(20,8) NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reserve_balance_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "reserve_balance_snapshots_provider_currency_key" ON "reserve_balance_snapshots"("provider", "currency");

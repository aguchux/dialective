ALTER TABLE "countries" ADD COLUMN "currencyCode" TEXT NOT NULL DEFAULT 'USD';
ALTER TABLE "countries" ADD COLUMN "usdExchangeRate" DECIMAL(18,6);
ALTER TABLE "countries" ADD COLUMN "exchangeRateSource" TEXT NOT NULL DEFAULT 'LIVE';
ALTER TABLE "countries" ADD COLUMN "exchangeRateUpdatedAt" TIMESTAMP(3);

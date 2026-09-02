-- Reserve balance every trainer must keep in their wallet -- admin-gated,
-- default 0.00 (no reserve, existing behavior unchanged).
ALTER TABLE "platform_settings" ADD COLUMN "minWalletBalanceTokens" DECIMAL(20,8) NOT NULL DEFAULT 0;

-- Startup signup credit is a one-time bonus per wallet. The application helper
-- is idempotent, and this partial unique index closes concurrent verification
-- races at the database level without affecting other ledger entry types.
CREATE UNIQUE INDEX IF NOT EXISTS "ledger_entries_one_startup_bonus_per_wallet"
  ON "ledger_entries" ("walletId")
  WHERE "type" = 'STARTUP_BONUS';

-- P2P trades no longer die when paymentWindowMinutes elapses.
--
-- The old behaviour auto-cancelled any trade still AWAITING_PAYMENT past its
-- paymentDeadlineAt. In production that timer was the single biggest killer
-- of trades: of 223 cancelled trades, 160 were auto-expiries and only 63 were
-- cancelled by a user. paymentDeadlineAt is now a countdown both parties see,
-- not a guillotine.
--
-- abandonedTradeHours is the replacement safety net. Opening a trade moves
-- the seller's tokens into lockedBalance, so without SOME backstop a buyer
-- who opens a trade and walks away would lock the seller's funds forever.
-- 0 disables it for a literal never-expires policy.
ALTER TABLE "p2p_market_settings"
  ADD COLUMN "abandonedTradeHours" INTEGER NOT NULL DEFAULT 48;

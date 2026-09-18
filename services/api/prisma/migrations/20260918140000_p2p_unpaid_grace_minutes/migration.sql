-- Sweep an unpaid trade shortly after its payment deadline instead of
-- leaving the seller's escrow locked for the 48h outer backstop.
--
-- Measured before this change: 59 of 60 buyers who paid did so inside the
-- 15-minute window (one outlier at 82 minutes), while 246 trades were
-- cancelled unpaid and not one ever reached abandonedTradeHours -- so the
-- hours-scale net was never catching anything, it just held escrow.
ALTER TABLE "p2p_market_settings"
  ADD COLUMN "unpaidGraceMinutes" INTEGER NOT NULL DEFAULT 10;

-- Peer-consensus claw-back of the BONUS portion of a training payout when
-- enough distinct validators independently flag a recording NO_AUDIO.
-- The trainer's stake (tokensSpent) is never touched -- see
-- clawBackNoAudioBonus in packages/db/src/payouts.ts.

ALTER TYPE "LedgerEntryType" ADD VALUE IF NOT EXISTS 'NO_AUDIO_BONUS_CLAWBACK';

ALTER TABLE "word_recordings"
  ADD COLUMN IF NOT EXISTS "noAudioFlagCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "noAudioClawedBackAt" TIMESTAMP(3);

ALTER TABLE "platform_settings"
  ADD COLUMN IF NOT EXISTS "noAudioClawbackFlagThreshold" INTEGER NOT NULL DEFAULT 2;

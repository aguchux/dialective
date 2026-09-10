-- AlterTable: admin override to let a dialect skip the ASR-availability
-- gate (WordsService.assertAsrAvailable) while no registry checkpoint
-- exists for it yet.
ALTER TABLE "dialects" ADD COLUMN "asrGateBypassed" BOOLEAN NOT NULL DEFAULT false;

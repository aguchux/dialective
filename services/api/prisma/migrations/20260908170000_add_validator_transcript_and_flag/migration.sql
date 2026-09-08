-- CreateEnum
CREATE TYPE "ValidatorFlagReason" AS ENUM ('UNCLEAR_AUDIO', 'EXCESSIVE_NOISE', 'CLIPPING_OR_DISTORTION', 'WRONG_LANGUAGE_OR_DIALECT', 'MULTIPLE_SPEAKERS', 'INCORRECT_PROMPT', 'INCOMPLETE_RECORDING', 'DUPLICATE_RECORDING', 'UNABLE_TO_TRANSCRIBE', 'OTHER');

-- AlterTable
ALTER TABLE "validator_deck_items" ADD COLUMN "validatorTranscript" TEXT;
ALTER TABLE "validator_deck_items" ADD COLUMN "validatorTranscriptUpdatedAt" TIMESTAMP(3);
ALTER TABLE "validator_deck_items" ADD COLUMN "flagReason" "ValidatorFlagReason";
ALTER TABLE "validator_deck_items" ADD COLUMN "flagNote" TEXT;
ALTER TABLE "validator_deck_items" ADD COLUMN "flaggedByUserId" TEXT;
ALTER TABLE "validator_deck_items" ADD COLUMN "flaggedAt" TIMESTAMP(3);

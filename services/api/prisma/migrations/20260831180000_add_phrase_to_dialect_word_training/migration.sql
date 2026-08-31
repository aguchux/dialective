-- AlterEnum
ALTER TYPE "WordTrainingDirection" ADD VALUE 'PHRASE_TO_DIALECT';

-- AlterTable
ALTER TABLE "prompts" ADD COLUMN "phraseWordCountMin" INTEGER;
ALTER TABLE "prompts" ADD COLUMN "phraseWordCountMax" INTEGER;

-- CreateIndex
CREATE INDEX "prompts_dialectTag_active_phraseWordCountMin_phraseWordCoun_idx" ON "prompts"("dialectTag", "active", "phraseWordCountMin", "phraseWordCountMax");

-- AlterTable
ALTER TABLE "platform_settings" ADD COLUMN "phraseEscalationEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "platform_settings" ADD COLUMN "phraseTierGenerationEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "platform_settings" ADD COLUMN "phraseTierItemsPerTierPerRun" INTEGER NOT NULL DEFAULT 3;

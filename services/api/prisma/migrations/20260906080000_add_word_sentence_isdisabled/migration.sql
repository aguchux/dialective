-- AlterTable
ALTER TABLE "words" ADD COLUMN     "isDisabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "sentences" ADD COLUMN     "isDisabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "words_isDisabled_idx" ON "words"("isDisabled");

-- CreateIndex
CREATE INDEX "sentences_isDisabled_idx" ON "sentences"("isDisabled");

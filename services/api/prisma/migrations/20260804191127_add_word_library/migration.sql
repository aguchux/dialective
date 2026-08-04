-- CreateTable
CREATE TABLE "words" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "words_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "word_recordings" (
    "id" TEXT NOT NULL,
    "wordId" TEXT NOT NULL,
    "dialectTag" TEXT NOT NULL,
    "translationText" TEXT NOT NULL,
    "audioBucket" TEXT NOT NULL,
    "audioKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "word_recordings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "words_text_key" ON "words"("text");

-- CreateIndex
CREATE INDEX "word_recordings_wordId_idx" ON "word_recordings"("wordId");

-- CreateIndex
CREATE INDEX "word_recordings_dialectTag_idx" ON "word_recordings"("dialectTag");

-- AddForeignKey
ALTER TABLE "word_recordings" ADD CONSTRAINT "word_recordings_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "words"("id") ON DELETE CASCADE ON UPDATE CASCADE;

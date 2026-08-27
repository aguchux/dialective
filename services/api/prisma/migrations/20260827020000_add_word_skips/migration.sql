-- Tracks per-trainer skip counts on ENGLISH_TO_DIALECT word assignments so a
-- word abandoned (never recorded) twice by the same trainer stops showing up
-- in their live-record dashboard again. New table, no backfill needed --
-- skip history before this migration is simply not counted.
CREATE TABLE "word_skips" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "wordId" TEXT NOT NULL,
    "skipCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "word_skips_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "word_skips_userId_wordId_key" ON "word_skips"("userId", "wordId");

ALTER TABLE "word_skips" ADD CONSTRAINT "word_skips_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "word_skips" ADD CONSTRAINT "word_skips_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "words"("id") ON DELETE CASCADE ON UPDATE CASCADE;

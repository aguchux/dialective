-- Tracks which assistant message (if any) an FAQ was converted from, so an
-- already-converted user question can't be double-converted into a second,
-- near-duplicate FAQ.
ALTER TABLE "assistant_messages" ADD COLUMN "convertedToFaqId" TEXT;

CREATE UNIQUE INDEX "assistant_messages_convertedToFaqId_key" ON "assistant_messages"("convertedToFaqId");

ALTER TABLE "assistant_messages" ADD CONSTRAINT "assistant_messages_convertedToFaqId_fkey"
  FOREIGN KEY ("convertedToFaqId") REFERENCES "faqs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

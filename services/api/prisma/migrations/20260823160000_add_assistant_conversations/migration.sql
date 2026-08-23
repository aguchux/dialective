CREATE TABLE "assistant_conversations" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "assistant_conversations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "assistant_conversations_userId_key" ON "assistant_conversations"("userId");

CREATE TABLE "assistant_messages" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "assistant_messages_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "assistant_messages_conversationId_createdAt_idx" ON "assistant_messages"("conversationId", "createdAt");

ALTER TABLE "assistant_conversations"
  ADD CONSTRAINT "assistant_conversations_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "assistant_messages"
  ADD CONSTRAINT "assistant_messages_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "assistant_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

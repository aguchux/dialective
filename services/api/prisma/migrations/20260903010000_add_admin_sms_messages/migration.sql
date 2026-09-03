CREATE TYPE "AdminSmsStatus" AS ENUM ('SENT', 'FAILED');

CREATE TABLE "admin_sms_messages" (
    "id" TEXT NOT NULL,
    "senderId" TEXT,
    "recipientId" TEXT,
    "phoneNumber" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "provider" TEXT,
    "status" "AdminSmsStatus" NOT NULL,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_sms_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "admin_sms_messages_recipientId_createdAt_idx"
ON "admin_sms_messages"("recipientId", "createdAt");

CREATE INDEX "admin_sms_messages_senderId_createdAt_idx"
ON "admin_sms_messages"("senderId", "createdAt");

ALTER TABLE "admin_sms_messages"
ADD CONSTRAINT "admin_sms_messages_senderId_fkey"
FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "admin_sms_messages"
ADD CONSTRAINT "admin_sms_messages_recipientId_fkey"
FOREIGN KEY ("recipientId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Voice Stream subscriber auth: password reset.
-- Mirrors PasswordResetToken but keyed to SubscriberUser (its own table,
-- same reason SubscriberOtpCode exists separately from OtpCode -- a hard FK
-- to the trainer User table can't reference SubscriberUser).
CREATE TABLE "subscriber_password_reset_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscriber_password_reset_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "subscriber_password_reset_tokens_tokenHash_key" ON "subscriber_password_reset_tokens"("tokenHash");

CREATE INDEX "subscriber_password_reset_tokens_userId_idx" ON "subscriber_password_reset_tokens"("userId");

ALTER TABLE "subscriber_password_reset_tokens" ADD CONSTRAINT "subscriber_password_reset_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "subscriber_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

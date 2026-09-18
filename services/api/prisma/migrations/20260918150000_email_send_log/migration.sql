-- Audit log for every email the platform attempts to send.
--
-- Email volume could not be measured at all: MailService logged nothing, so
-- answering "what is eating the Resend quota" meant inferring it from
-- otp_codes rows and course-completion counts instead of counting real
-- sends. Suppressed attempts are recorded too, so the effect of a
-- preference gate or an audience filter shows up as data rather than as an
-- absence of rows.
--
-- No body/HTML is stored -- subject and kind answer "how much" and "was
-- this user emailed" without keeping a copy of every password-reset link
-- and OTP code ever sent.
CREATE TABLE "email_send_logs" (
  "id"               TEXT NOT NULL,
  "userId"           TEXT,
  "toEmail"          TEXT NOT NULL,
  "kind"             TEXT NOT NULL,
  "subject"          TEXT NOT NULL,
  "sent"             BOOLEAN NOT NULL DEFAULT true,
  "suppressedReason" TEXT,
  "errorMessage"     TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "email_send_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "email_send_logs_createdAt_idx" ON "email_send_logs" ("createdAt");
CREATE INDEX "email_send_logs_kind_createdAt_idx" ON "email_send_logs" ("kind", "createdAt");
CREATE INDEX "email_send_logs_userId_createdAt_idx" ON "email_send_logs" ("userId", "createdAt");

-- SET NULL, not CASCADE: the volume record must survive the account being
-- deleted, otherwise the audit trail rewrites itself whenever a user leaves.
ALTER TABLE "email_send_logs"
  ADD CONSTRAINT "email_send_logs_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users" ("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

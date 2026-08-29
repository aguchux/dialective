ALTER TABLE "platform_settings" ADD COLUMN "qracEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "platform_settings" ADD COLUMN "qracIntervalMinutes" INTEGER NOT NULL DEFAULT 30;

ALTER TABLE "training_sessions" ADD COLUMN "lastQracAt" TIMESTAMP(3);

CREATE TABLE "qrac_affirmation_submissions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT,
    "version" TEXT NOT NULL,
    "checklistVersion" TEXT NOT NULL DEFAULT 'v1',
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "qrac_affirmation_submissions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "qrac_affirmation_submissions_userId_signedAt_idx" ON "qrac_affirmation_submissions"("userId", "signedAt");

ALTER TABLE "qrac_affirmation_submissions" ADD CONSTRAINT "qrac_affirmation_submissions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "qrac_affirmation_submissions" ADD CONSTRAINT "qrac_affirmation_submissions_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "training_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

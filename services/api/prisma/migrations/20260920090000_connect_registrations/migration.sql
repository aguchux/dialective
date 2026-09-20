-- Additive public interest capture. No existing rows or columns are modified.
CREATE TABLE "connect_registrations" (
    "id" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "attending" BOOLEAN NOT NULL DEFAULT true,
    "speaking" BOOLEAN NOT NULL DEFAULT false,
    "speakerTopic" TEXT,
    "speakerSummary" TEXT,
    "consentedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "connect_registrations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "connect_registrations_eventKey_email_key" ON "connect_registrations"("eventKey", "email");
CREATE INDEX "connect_registrations_eventKey_countryCode_idx" ON "connect_registrations"("eventKey", "countryCode");

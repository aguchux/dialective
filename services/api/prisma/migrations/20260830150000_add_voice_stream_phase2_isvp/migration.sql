-- Dialect Library Voice Stream -- Phase 2 (ISVP / ISVS / ISVC).
-- Independent Subscriber Validation Programme: org-normalized validations,
-- aggregated by services/isvc-scorer into a versioned ISVC consensus.

CREATE TYPE "IsvcConfidence" AS ENUM ('EMERGING', 'ESTABLISHED', 'HIGH', 'VERY_HIGH');

CREATE TABLE "subscriber_validations" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "recordingId" TEXT NOT NULL,
    "transcriptAccuracy" INTEGER NOT NULL,
    "pronunciationAccuracy" INTEGER NOT NULL,
    "dialectAuthenticity" INTEGER NOT NULL,
    "speechClarity" INTEGER NOT NULL,
    "audioQuality" INTEGER NOT NULL,
    "overallScore" INTEGER NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscriber_validations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "subscriber_validations_organizationId_userId_recordingId_key" ON "subscriber_validations"("organizationId", "userId", "recordingId");

CREATE INDEX "subscriber_validations_recordingId_idx" ON "subscriber_validations"("recordingId");

CREATE INDEX "subscriber_validations_organizationId_recordingId_idx" ON "subscriber_validations"("organizationId", "recordingId");

CREATE TABLE "organization_validation_consensus" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "recordingId" TEXT NOT NULL,
    "validatorCount" INTEGER NOT NULL,
    "meanScore" DECIMAL(5,2) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_validation_consensus_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "organization_validation_consensus_organizationId_recordingId_key" ON "organization_validation_consensus"("organizationId", "recordingId");

CREATE INDEX "organization_validation_consensus_recordingId_idx" ON "organization_validation_consensus"("recordingId");

CREATE TABLE "isvc_aggregations" (
    "id" TEXT NOT NULL,
    "recordingId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "isvs" DECIMAL(5,2) NOT NULL,
    "agreement" DECIMAL(5,2) NOT NULL,
    "confidence" "IsvcConfidence" NOT NULL,
    "organizationCount" INTEGER NOT NULL,
    "outlierOrgCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "isvc_aggregations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "isvc_aggregations_recordingId_version_key" ON "isvc_aggregations"("recordingId", "version");

CREATE INDEX "isvc_aggregations_recordingId_idx" ON "isvc_aggregations"("recordingId");

CREATE TABLE "isvc_current" (
    "recordingId" TEXT NOT NULL,
    "aggregationId" TEXT NOT NULL,

    CONSTRAINT "isvc_current_pkey" PRIMARY KEY ("recordingId")
);

CREATE UNIQUE INDEX "isvc_current_aggregationId_key" ON "isvc_current"("aggregationId");

ALTER TABLE "subscriber_validations" ADD CONSTRAINT "subscriber_validations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "subscriber_organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "subscriber_validations" ADD CONSTRAINT "subscriber_validations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "subscriber_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "organization_validation_consensus" ADD CONSTRAINT "organization_validation_consensus_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "subscriber_organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "isvc_current" ADD CONSTRAINT "isvc_current_aggregationId_fkey" FOREIGN KEY ("aggregationId") REFERENCES "isvc_aggregations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

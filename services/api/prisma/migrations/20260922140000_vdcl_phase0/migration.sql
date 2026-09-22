-- CreateEnum
CREATE TYPE "VdclPurpose" AS ENUM ('ASR_TRAINING', 'TTS_TRAINING', 'LLM_TRAINING', 'LINGUISTIC_RESEARCH', 'DATASET_REDISTRIBUTION', 'PUBLIC_PROMOTION', 'BIOMETRIC_PROCESSING', 'VOICE_CLONING');

-- CreateEnum
CREATE TYPE "VdclVersionStatus" AS ENUM ('DRAFT', 'PENDING_COMPILATION', 'PENDING_REVIEW', 'PENDING_COUNTERSIGNATURE', 'ACTIVE', 'SUPERSEDED', 'WITHDRAWN', 'SUSPENDED', 'REJECTED', 'AMENDMENT_PENDING');

-- CreateEnum
CREATE TYPE "VdclCompilationStage" AS ENUM ('SUBMITTED', 'INVENTORYING', 'TRANSCRIPT_CHECK', 'VALIDATION_CHECK', 'METRICS_CALCULATION', 'COMPLIANCE_REVIEW', 'COUNTERSIGNATURE', 'ISSUED', 'FAILED');

-- AlterTable
ALTER TABLE "platform_settings" ADD COLUMN     "vdclEnforcementEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "vdclRetentionExemptionEnabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "vdcl_agreements" (
    "id" TEXT NOT NULL,
    "licenceKey" TEXT NOT NULL,
    "contributorId" TEXT NOT NULL,
    "dialectTag" TEXT NOT NULL,
    "countryId" TEXT,
    "activeVersionId" TEXT,
    "withdrawnAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vdcl_agreements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vdcl_versions" (
    "id" TEXT NOT NULL,
    "agreementId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "VdclVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "kycVerificationId" TEXT,
    "manifestHash" TEXT,
    "pdfHash" TEXT,
    "pngHash" TEXT,
    "pdfKey" TEXT,
    "pngKey" TEXT,
    "termsVersion" TEXT,
    "signedAt" TIMESTAMP(3),
    "countersignedAt" TIMESTAMP(3),
    "countersignedById" TEXT,
    "effectiveFrom" TIMESTAMP(3),
    "effectiveUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vdcl_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vdcl_consent_grants" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "purpose" "VdclPurpose" NOT NULL,
    "wordingVersion" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locale" TEXT,
    "userAgent" TEXT,
    "ipAddress" TEXT,

    CONSTRAINT "vdcl_consent_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vdcl_manifests" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "manifestKey" TEXT NOT NULL,
    "recordingCount" INTEGER NOT NULL,
    "totalDurationMs" BIGINT NOT NULL,
    "transcriptCount" INTEGER NOT NULL,
    "excludedCount" INTEGER NOT NULL,
    "meanCompositeScore" DECIMAL(5,2),
    "asrPipelineVersion" TEXT,
    "qualityPipelineVersion" TEXT,
    "scoreDefinitions" JSONB,
    "compiledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vdcl_manifests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vdcl_manifest_items" (
    "id" TEXT NOT NULL,
    "manifestId" TEXT NOT NULL,
    "recordingId" TEXT NOT NULL,
    "durationMs" INTEGER,
    "dialectTag" TEXT NOT NULL,
    "compositeScore" DECIMAL(5,2),
    "score" DECIMAL(5,2),
    "hasTranscript" BOOLEAN NOT NULL DEFAULT false,
    "audioPurgedAt" TIMESTAMP(3),

    CONSTRAINT "vdcl_manifest_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vdcl_signature_events" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "actorId" TEXT,
    "eventType" TEXT NOT NULL,
    "stepUpMethod" TEXT,
    "signatureKind" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vdcl_signature_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vdcl_compilation_jobs" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "stage" "VdclCompilationStage" NOT NULL DEFAULT 'SUBMITTED',
    "progressPercent" INTEGER NOT NULL DEFAULT 0,
    "blockerMessage" TEXT,
    "estimatedCompletionAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vdcl_compilation_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vdcl_audit_events" (
    "id" TEXT NOT NULL,
    "agreementId" TEXT,
    "versionId" TEXT,
    "recordingId" TEXT,
    "actorId" TEXT,
    "eventType" TEXT NOT NULL,
    "purpose" "VdclPurpose",
    "detail" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vdcl_audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vdcl_agreements_licenceKey_key" ON "vdcl_agreements"("licenceKey");

-- CreateIndex
CREATE UNIQUE INDEX "vdcl_agreements_activeVersionId_key" ON "vdcl_agreements"("activeVersionId");

-- CreateIndex
CREATE INDEX "vdcl_agreements_contributorId_idx" ON "vdcl_agreements"("contributorId");

-- CreateIndex
CREATE INDEX "vdcl_agreements_dialectTag_idx" ON "vdcl_agreements"("dialectTag");

-- CreateIndex
CREATE UNIQUE INDEX "vdcl_agreements_contributorId_dialectTag_key" ON "vdcl_agreements"("contributorId", "dialectTag");

-- CreateIndex
CREATE INDEX "vdcl_versions_agreementId_status_idx" ON "vdcl_versions"("agreementId", "status");

-- CreateIndex
CREATE INDEX "vdcl_versions_status_idx" ON "vdcl_versions"("status");

-- CreateIndex
CREATE UNIQUE INDEX "vdcl_versions_agreementId_version_key" ON "vdcl_versions"("agreementId", "version");

-- CreateIndex
CREATE INDEX "vdcl_consent_grants_versionId_idx" ON "vdcl_consent_grants"("versionId");

-- CreateIndex
CREATE UNIQUE INDEX "vdcl_consent_grants_versionId_purpose_key" ON "vdcl_consent_grants"("versionId", "purpose");

-- CreateIndex
CREATE UNIQUE INDEX "vdcl_manifests_versionId_key" ON "vdcl_manifests"("versionId");

-- CreateIndex
CREATE UNIQUE INDEX "vdcl_manifests_manifestKey_key" ON "vdcl_manifests"("manifestKey");

-- CreateIndex
CREATE INDEX "vdcl_manifest_items_manifestId_idx" ON "vdcl_manifest_items"("manifestId");

-- CreateIndex
CREATE INDEX "vdcl_manifest_items_recordingId_idx" ON "vdcl_manifest_items"("recordingId");

-- CreateIndex
CREATE UNIQUE INDEX "vdcl_manifest_items_manifestId_recordingId_key" ON "vdcl_manifest_items"("manifestId", "recordingId");

-- CreateIndex
CREATE INDEX "vdcl_signature_events_versionId_createdAt_idx" ON "vdcl_signature_events"("versionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "vdcl_compilation_jobs_versionId_key" ON "vdcl_compilation_jobs"("versionId");

-- CreateIndex
CREATE INDEX "vdcl_compilation_jobs_stage_createdAt_idx" ON "vdcl_compilation_jobs"("stage", "createdAt");

-- CreateIndex
CREATE INDEX "vdcl_audit_events_agreementId_createdAt_idx" ON "vdcl_audit_events"("agreementId", "createdAt");

-- CreateIndex
CREATE INDEX "vdcl_audit_events_versionId_createdAt_idx" ON "vdcl_audit_events"("versionId", "createdAt");

-- CreateIndex
CREATE INDEX "vdcl_audit_events_eventType_createdAt_idx" ON "vdcl_audit_events"("eventType", "createdAt");

-- AddForeignKey
ALTER TABLE "vdcl_agreements" ADD CONSTRAINT "vdcl_agreements_contributorId_fkey" FOREIGN KEY ("contributorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vdcl_agreements" ADD CONSTRAINT "vdcl_agreements_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "countries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vdcl_agreements" ADD CONSTRAINT "vdcl_agreements_activeVersionId_fkey" FOREIGN KEY ("activeVersionId") REFERENCES "vdcl_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vdcl_versions" ADD CONSTRAINT "vdcl_versions_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "vdcl_agreements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vdcl_versions" ADD CONSTRAINT "vdcl_versions_kycVerificationId_fkey" FOREIGN KEY ("kycVerificationId") REFERENCES "kyc_verifications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vdcl_consent_grants" ADD CONSTRAINT "vdcl_consent_grants_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "vdcl_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vdcl_manifests" ADD CONSTRAINT "vdcl_manifests_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "vdcl_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vdcl_manifest_items" ADD CONSTRAINT "vdcl_manifest_items_manifestId_fkey" FOREIGN KEY ("manifestId") REFERENCES "vdcl_manifests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vdcl_signature_events" ADD CONSTRAINT "vdcl_signature_events_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "vdcl_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vdcl_signature_events" ADD CONSTRAINT "vdcl_signature_events_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vdcl_compilation_jobs" ADD CONSTRAINT "vdcl_compilation_jobs_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "vdcl_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;


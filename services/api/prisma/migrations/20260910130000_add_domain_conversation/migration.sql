-- AlterTable: PlatformSettings gains the Domain Conversation task's
-- admin-configurable knobs (task/generation toggles, duration gate, token
-- cost, LLM provider order, quality-scoring weights).
ALTER TABLE "platform_settings" ADD COLUMN "domainConversationTaskEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "platform_settings" ADD COLUMN "domainConversationMinDurationSeconds" INTEGER;
ALTER TABLE "platform_settings" ADD COLUMN "domainConversationMaxDurationSeconds" INTEGER;
ALTER TABLE "platform_settings" ADD COLUMN "domainConversationTaskTokenCost" DECIMAL(20,8);
ALTER TABLE "platform_settings" ADD COLUMN "domainConversationGenerationEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "platform_settings" ADD COLUMN "domainConversationPromptsPerRun" INTEGER NOT NULL DEFAULT 15;
ALTER TABLE "platform_settings" ADD COLUMN "domainConversationMaxPromptPoolSize" INTEGER NOT NULL DEFAULT 500;
ALTER TABLE "platform_settings" ADD COLUMN "domainConversationProviderOrder" TEXT NOT NULL DEFAULT 'openai,deepseek,anthropic';
ALTER TABLE "platform_settings" ADD COLUMN "domainConversationQualityWeightNoise" DECIMAL(5,2) NOT NULL DEFAULT 40;
ALTER TABLE "platform_settings" ADD COLUMN "domainConversationQualityWeightQuality" DECIMAL(5,2) NOT NULL DEFAULT 30;
ALTER TABLE "platform_settings" ADD COLUMN "domainConversationQualityWeightLiveness" DECIMAL(5,2) NOT NULL DEFAULT 30;
ALTER TABLE "platform_settings" ADD COLUMN "domainConversationMinQualityScoreForPayout" DECIMAL(5,2) NOT NULL DEFAULT 50;

-- CreateEnum
CREATE TYPE "DomainPromptGenderVariant" AS ENUM ('NEUTRAL', 'MALE', 'FEMALE');

-- CreateTable
CREATE TABLE "domain_prompts" (
    "id" TEXT NOT NULL,
    "scenarioKey" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "genderVariant" "DomainPromptGenderVariant" NOT NULL DEFAULT 'NEUTRAL',
    "text" TEXT NOT NULL,
    "isDisabled" BOOLEAN NOT NULL DEFAULT false,
    "lastServedAt" TIMESTAMP(3),
    "timesServed" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT 'llm',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "domain_prompts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "domain_prompts_scenarioKey_genderVariant_key" ON "domain_prompts"("scenarioKey", "genderVariant");
CREATE INDEX "domain_prompts_domain_idx" ON "domain_prompts"("domain");
CREATE INDEX "domain_prompts_genderVariant_isDisabled_lastServedAt_idx" ON "domain_prompts"("genderVariant", "isDisabled", "lastServedAt");

-- CreateTable
CREATE TABLE "domain_conversation_assignments" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "promptId" TEXT NOT NULL,
    "uploadBucket" TEXT,
    "uploadKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "consumedAt" TIMESTAMP(3),

    CONSTRAINT "domain_conversation_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "domain_conversation_assignments_sessionId_createdAt_idx" ON "domain_conversation_assignments"("sessionId", "createdAt");

-- CreateTable
CREATE TABLE "domain_conversation_recordings" (
    "id" TEXT NOT NULL,
    "promptId" TEXT NOT NULL,
    "userId" TEXT,
    "sessionId" TEXT,
    "assignmentId" TEXT,
    "dialectTag" TEXT NOT NULL,
    "dialectVariantId" TEXT,
    "audioBucket" TEXT,
    "audioKey" TEXT,
    "audioDeletedAt" TIMESTAMP(3),
    "durationMs" INTEGER NOT NULL,
    "noiseRating" "RecordingNoiseRating",
    "status" "SubmissionStatus" NOT NULL DEFAULT 'PENDING',
    "rejectionReason" TEXT,
    "tokensSpent" DECIMAL(20,8) NOT NULL DEFAULT 0,
    "noiseScore" DECIMAL(5,2),
    "qualityScore" DECIMAL(5,2),
    "livenessScore" DECIMAL(5,2),
    "compositeScore" DECIMAL(5,2),
    "qualityGateCheckedAt" TIMESTAMP(3),
    "payoutTokenAmount" DECIMAL(20,8),
    "scoredAt" TIMESTAMP(3),
    "settledAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "adminAuditStatus" "AdminAuditStatus",
    "adminAuditedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "domain_conversation_recordings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "domain_conversation_recordings_assignmentId_key" ON "domain_conversation_recordings"("assignmentId");
CREATE INDEX "domain_conversation_recordings_promptId_idx" ON "domain_conversation_recordings"("promptId");
CREATE INDEX "domain_conversation_recordings_userId_createdAt_idx" ON "domain_conversation_recordings"("userId", "createdAt");
CREATE INDEX "domain_conversation_recordings_sessionId_idx" ON "domain_conversation_recordings"("sessionId");
CREATE INDEX "domain_conversation_recordings_dialectTag_idx" ON "domain_conversation_recordings"("dialectTag");
CREATE INDEX "domain_conversation_recordings_status_idx" ON "domain_conversation_recordings"("status");

-- AddForeignKey
ALTER TABLE "domain_conversation_assignments"
ADD CONSTRAINT "domain_conversation_assignments_sessionId_fkey"
FOREIGN KEY ("sessionId") REFERENCES "training_sessions"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "domain_conversation_assignments"
ADD CONSTRAINT "domain_conversation_assignments_promptId_fkey"
FOREIGN KEY ("promptId") REFERENCES "domain_prompts"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "domain_conversation_recordings"
ADD CONSTRAINT "domain_conversation_recordings_promptId_fkey"
FOREIGN KEY ("promptId") REFERENCES "domain_prompts"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "domain_conversation_recordings"
ADD CONSTRAINT "domain_conversation_recordings_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "domain_conversation_recordings"
ADD CONSTRAINT "domain_conversation_recordings_sessionId_fkey"
FOREIGN KEY ("sessionId") REFERENCES "training_sessions"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "domain_conversation_recordings"
ADD CONSTRAINT "domain_conversation_recordings_assignmentId_fkey"
FOREIGN KEY ("assignmentId") REFERENCES "domain_conversation_assignments"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "domain_conversation_recordings"
ADD CONSTRAINT "domain_conversation_recordings_dialectVariantId_fkey"
FOREIGN KEY ("dialectVariantId") REFERENCES "dialect_variants"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable: ValidatorDeckItem gains a polymorphic recordKind discriminator
-- so a deck can hold either WordRecording or DomainConversationRecording
-- items. Existing rows default to WORD_RECORDING (non-breaking backfill).
CREATE TYPE "ValidatorRecordKind" AS ENUM ('WORD_RECORDING', 'DOMAIN_CONVERSATION_RECORDING');

ALTER TABLE "validator_deck_items" ADD COLUMN "recordKind" "ValidatorRecordKind" NOT NULL DEFAULT 'WORD_RECORDING';

DROP INDEX "validator_deck_items_deckId_recordingId_key";
CREATE UNIQUE INDEX "validator_deck_items_deckId_recordKind_recordingId_key" ON "validator_deck_items"("deckId", "recordKind", "recordingId");

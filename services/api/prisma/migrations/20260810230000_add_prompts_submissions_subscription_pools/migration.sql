-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('PENDING', 'TRANSCRIBED', 'REJECTED', 'SCORED', 'SETTLED');

-- CreateEnum
CREATE TYPE "SubscriptionPoolStatus" AS ENUM ('ACTIVE', 'CLOSED');

-- CreateTable
CREATE TABLE "prompts" (
    "id" TEXT NOT NULL,
    "dialectTag" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prompts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submissions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "promptId" TEXT NOT NULL,
    "dialectTag" TEXT NOT NULL,
    "audioBucket" TEXT NOT NULL,
    "audioKey" TEXT NOT NULL,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'PENDING',
    "transcript" TEXT,
    "asrConfidence" DECIMAL(5,4),
    "asrEngine" TEXT,
    "rejectionReason" TEXT,
    "tokensSpent" DECIMAL(20,8) NOT NULL DEFAULT 0,
    "score" DECIMAL(5,2),
    "isOutlier" BOOLEAN NOT NULL DEFAULT false,
    "payoutTokenAmount" DECIMAL(20,8),
    "scoredAt" TIMESTAMP(3),
    "settledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_pools" (
    "id" TEXT NOT NULL,
    "subscriberName" TEXT NOT NULL,
    "subscriberEmail" TEXT NOT NULL,
    "organization" TEXT,
    "dataAccessLeadId" TEXT,
    "usdAmount" DECIMAL(20,8) NOT NULL,
    "status" "SubscriptionPoolStatus" NOT NULL DEFAULT 'ACTIVE',
    "note" TEXT,
    "openedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "subscription_pools_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "prompts_dialectTag_active_idx" ON "prompts"("dialectTag", "active");

-- CreateIndex
CREATE INDEX "submissions_promptId_dialectTag_idx" ON "submissions"("promptId", "dialectTag");

-- CreateIndex
CREATE INDEX "submissions_status_idx" ON "submissions"("status");

-- CreateIndex
CREATE INDEX "submissions_userId_idx" ON "submissions"("userId");

-- CreateIndex
CREATE INDEX "subscription_pools_status_idx" ON "subscription_pools"("status");

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_promptId_fkey" FOREIGN KEY ("promptId") REFERENCES "prompts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_pools" ADD CONSTRAINT "subscription_pools_dataAccessLeadId_fkey" FOREIGN KEY ("dataAccessLeadId") REFERENCES "data_access_leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_pools" ADD CONSTRAINT "subscription_pools_openedByUserId_fkey" FOREIGN KEY ("openedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

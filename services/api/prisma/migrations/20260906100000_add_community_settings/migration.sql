-- CreateTable
CREATE TABLE "community_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "postingEnabled" BOOLEAN NOT NULL DEFAULT true,
    "repliesEnabled" BOOLEAN NOT NULL DEFAULT true,
    "attachmentsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "reactionsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "newMemberPostingDelayMinutes" INTEGER NOT NULL DEFAULT 0,
    "requireApprovalForNewMembers" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "community_settings_pkey" PRIMARY KEY ("id")
);

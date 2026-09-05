ALTER TABLE "assistant_conversations"
  ADD COLUMN "githubIssueNumber" INTEGER,
  ADD COLUMN "githubIssueUrl" TEXT,
  ADD COLUMN "githubIssueCreatedAt" TIMESTAMP(3);

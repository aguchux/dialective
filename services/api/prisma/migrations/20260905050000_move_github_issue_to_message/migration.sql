-- Move Git-backlog issue tracking from the whole conversation to the
-- individual user message it was filed for, mirroring convertedToFaqId's
-- per-message scope. No production rows have a filed issue yet (feature
-- just shipped), so this is a pure column relocation, not a backfill.
ALTER TABLE "assistant_conversations"
  DROP COLUMN "githubIssueCreatedAt",
  DROP COLUMN "githubIssueNumber",
  DROP COLUMN "githubIssueUrl";

ALTER TABLE "assistant_messages"
  ADD COLUMN "githubIssueCreatedAt" TIMESTAMP(3),
  ADD COLUMN "githubIssueNumber" INTEGER,
  ADD COLUMN "githubIssueUrl" TEXT;

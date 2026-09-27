-- Per-record, per-subscriber, per-period stream usage: the accounting source a
-- contributor revenue pool divides.
--
-- Purely additive -- one new table, nothing existing touched. It stays empty
-- until the usage-aggregation CronJob runs, and production currently has zero
-- stream access log rows, so the first runs will legitimately aggregate nothing.
--
-- Why not settle straight from stream_access_logs: that table is an audit trail
-- (append-only, unbounded, no retention policy). Settling from it would scan
-- every stream request ever made, and would recompute a historical period
-- differently once rows aged out.

CREATE TABLE "recording_usage_periods" (
    "id" TEXT NOT NULL,
    -- Part of the record's identity: the two record tables have independent
    -- uuid spaces.
    "recordKind" "StreamRecordKind" NOT NULL DEFAULT 'WORD_RECORDING',
    "recordingId" TEXT NOT NULL,
    -- Denormalised at aggregation time, deliberately. WordRecording.userId is
    -- nullable, so a deleted account would otherwise make already-earned usage
    -- unattributable -- and a royalty already earned is already owed.
    "contributorId" TEXT NOT NULL,
    -- No FK, for the same reason: the row must outlive the organisation.
    "organizationId" TEXT NOT NULL,
    -- First of month, UTC midnight. Same anchor as usage_counters.periodStart.
    "periodStart" TIMESTAMP(3) NOT NULL,
    -- THE measure for splitting a pool, counted from `allowed` audio requests
    -- only. A 403 is not usage.
    "streamCount" INTEGER NOT NULL DEFAULT 0,
    -- Reporting only, NOT used to split a pool: durationStreamedMs holds the
    -- record's full duration regardless of the range bytes actually served, so
    -- splitting by it would over-reward many small range requests.
    "durationMs" BIGINT NOT NULL DEFAULT 0,
    "bytesStreamed" BIGINT NOT NULL DEFAULT 0,
    "aggregatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recording_usage_periods_pkey" PRIMARY KEY ("id")
);

-- Name is Prisma's own, including its truncation at Postgres's 63-character
-- identifier limit. Writing the untruncated name here would create an index the
-- schema does not expect and read as permanent drift.
CREATE UNIQUE INDEX "recording_usage_periods_recordKind_recordingId_organization_key"
  ON "recording_usage_periods"("recordKind", "recordingId", "organizationId", "periodStart");

-- The pool query: one subscriber's usage for one period.
CREATE INDEX "recording_usage_periods_organizationId_periodStart_idx"
  ON "recording_usage_periods"("organizationId", "periodStart");
-- The contributor-facing query: what did I earn this period.
CREATE INDEX "recording_usage_periods_contributorId_periodStart_idx"
  ON "recording_usage_periods"("contributorId", "periodStart");

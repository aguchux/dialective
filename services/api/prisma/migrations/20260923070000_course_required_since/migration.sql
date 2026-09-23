-- Grandfathering for mandated courses.
--
-- `required` alone has no sense of WHEN a course became required, so
-- marking a fourth course required on 2026-09-16 retrospectively blocked
-- 1,628 trainers who had already completed every required course that
-- existed when they signed up. They had done nothing wrong, and from their
-- side the platform simply started demanding training again.
--
-- requiredSince records the moment a course became required. The gate
-- compares it against User.createdAt, so a new requirement applies to
-- trainers who join afterwards and never reaches back.

ALTER TABLE "courses" ADD COLUMN "requiredSince" TIMESTAMP(3);
ALTER TABLE "course_progress" ADD COLUMN "suggestionDismissedAt" TIMESTAMP(3);

-- Backfill: every course that is required TODAY gets a requiredSince, so no
-- row is left with the null-means-applies-to-everyone legacy reading.
--
-- publishedAt is the honest approximation of when each became required --
-- these were authored as required rather than flipped later, and it is the
-- only timestamp on the row that is not destroyed by ordinary edits
-- (updatedAt moved to 2026-09-19 for all four when they were last edited,
-- which would wrongly grandfather everyone who joined before then,
-- including trainers who genuinely never did the original three).
--
-- COALESCE to createdAt covers a required course that was never published;
-- it cannot gate anyone while unpublished, but leaving it null would give
-- it the legacy "applies to everyone" reading the moment it is published.
UPDATE "courses"
SET "requiredSince" = COALESCE("publishedAt", "createdAt")
WHERE "required" = true;

-- Partial index over exactly the rows the gate scans (published + required).
CREATE INDEX "courses_status_required_requiredSince_idx"
  ON "courses" ("status", "required", "requiredSince");

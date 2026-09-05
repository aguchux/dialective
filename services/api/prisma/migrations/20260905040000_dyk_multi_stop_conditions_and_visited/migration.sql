-- AlterTable: add the new array column first, backfill from the old single
-- column, then drop it -- preserves any rows created before this deploy
-- (single-condition semantics carry over exactly: a one-element array).
ALTER TABLE "DykNotice" ADD COLUMN "stopConditions" TEXT[] DEFAULT ARRAY['CLICKED']::TEXT[];
UPDATE "DykNotice" SET "stopConditions" = ARRAY["stopCondition"];
ALTER TABLE "DykNotice" DROP COLUMN "stopCondition";

-- AlterTable
ALTER TABLE "DykUserState" ADD COLUMN "visitedAt" TIMESTAMP(3);

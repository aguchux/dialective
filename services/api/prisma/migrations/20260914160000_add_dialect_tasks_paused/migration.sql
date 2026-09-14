ALTER TABLE "dialects"
  ADD COLUMN "tasksPaused" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "dialect_variants"
  ADD COLUMN "tasksPaused" BOOLEAN NOT NULL DEFAULT false;

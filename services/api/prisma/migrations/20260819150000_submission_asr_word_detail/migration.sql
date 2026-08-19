-- Per-word ASR detail (word/start/end/conf) for admin transcript visualization.

ALTER TABLE "submissions" ADD COLUMN "asrWordDetail" JSONB;

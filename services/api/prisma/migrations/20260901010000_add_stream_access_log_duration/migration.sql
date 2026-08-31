-- Voice Stream dashboard: "hours streamed" usage metric.
-- StreamAccessLog rows for audio requests now carry the recording's
-- durationMs at request time, so subscriber-analytics can sum it into a
-- coarse hours-streamed figure without joining back to WordRecording
-- (which is a loose reference, not a Prisma relation, on this table).
ALTER TABLE "stream_access_logs" ADD COLUMN "durationStreamedMs" INTEGER;

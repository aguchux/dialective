-- Admin tick on the ASR Transcription page: re-publish this dialect's
-- already-recorded audio to ASR. A dialect only transcribes recordings
-- submitted after it was mapped in asr-registry.yaml, so without this its
-- history stays permanently blank. Defaults false -- the backfill only
-- ever runs for a dialect an admin has explicitly ticked.
ALTER TABLE "dialects" ADD COLUMN "asrBackfillEnabled" BOOLEAN NOT NULL DEFAULT false;

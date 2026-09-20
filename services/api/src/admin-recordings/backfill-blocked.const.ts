/**
 * Dialects whose checkpoint is too large to sustain an ASR backfill on the
 * current whisper-worker fleet.
 *
 * A whisper-medium is ~3GB resident against whisper-worker's 3584Mi pod
 * limit. It handles the occasional live recording fine, but a sustained
 * backlog alongside live traffic in another dialect OOMKilled all five
 * pods within minutes on 2026-09-20 and stopped live transcription
 * outright. Capping the pipeline cache at 1 does not help: one medium
 * model plus a second dialect arriving is already over the limit.
 *
 * This is a capacity limit rather than a model problem -- the same wall
 * that keeps `sn` unmapped. Remove an entry once the fleet has the
 * headroom, not before.
 *
 * Shared by asr-backfill.ts (which unticks a blocked dialect) and
 * AdminRecordingsService (which refuses to tick one, so the admin gets a
 * reason instead of a checkbox that silently clears itself).
 */
export const BACKFILL_BLOCKED: Record<string, string> = {
  zu: 'whisper-medium (~3GB) -- OOMKilled the whole fleet when backfilled on 2026-09-20',
  ary: 'whisper-medium (~3GB) -- same footprint as zu',
  'ar-dz': "whisper-medium (~3GB) -- shares ary's checkpoint",
};

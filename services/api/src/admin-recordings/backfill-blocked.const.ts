/**
 * ASR backfill is disabled outright on the current fleet.
 *
 * Measured twice on 2026-09-20, against live traffic:
 *
 *   zu (whisper-MEDIUM, ~3GB)  -> all 5 whisper-worker pods OOMKilled
 *                                 within minutes, 19 jobs dead-lettered,
 *                                 0 transcripts written.
 *   xh (whisper-SMALL,  ~1GB)  -> transcripts DID land (47 -> 121), but
 *                                 4 of 5 pods still OOMKilled.
 *
 * The second result is the important one: it rules out "just avoid the
 * mediums". whisper-worker's 3584Mi pod limit has enough headroom for the
 * dialect mix live traffic happens to bring, and not enough for that mix
 * plus a sustained second dialect -- regardless of which checkpoint the
 * backfill uses. Capping _pipeline_cache at 1 does not help, because the
 * cost is the eviction/reload churn of alternating between two dialects,
 * not the resident size of any single model.
 *
 * So this is a capacity problem, the same wall that keeps `sn` unmapped,
 * and the fix is worker memory rather than a smarter batch size or
 * schedule. Until the fleet grows, any tick would trade live
 * transcription for history.
 *
 * Recovery, if a backfill is ever run and the pods start dying:
 *   redis-cli XGROUP SETID asr-jobs-whisper asr-workers-whisper $
 *   kubectl delete pod -l app=whisper-worker
 * The first skips the queued backfill jobs; the second restarts the pods
 * onto live traffic only. Both were needed, in that order.
 *
 * Shared by asr-backfill.ts (which unticks a blocked dialect) and
 * AdminRecordingsService (which refuses to tick one, so the admin gets a
 * reason instead of a checkbox that silently clears itself).
 */
const FLEET_CAPACITY_REASON =
  'ASR backfill is off until whisper-worker has more memory -- on 2026-09-20 it OOMKilled the worker fleet and stopped live transcription, with a small checkpoint as well as a medium one';

/**
 * Every dialect currently mapped for ASR. Listing them explicitly rather
 * than blocking everything keeps the shape ready for per-dialect
 * re-enablement once the fleet grows: delete the ones that fit, keep the
 * ones that don't.
 */
export const BACKFILL_BLOCKED: Record<string, string> = {
  pcm: FLEET_CAPACITY_REASON,
  zu: FLEET_CAPACITY_REASON,
  xh: FLEET_CAPACITY_REASON,
  am: FLEET_CAPACITY_REASON,
  'st-za': FLEET_CAPACITY_REASON,
  st: FLEET_CAPACITY_REASON,
  ak: FLEET_CAPACITY_REASON,
  'sw-ke': FLEET_CAPACITY_REASON,
  'sw-tz': FLEET_CAPACITY_REASON,
  arz: FLEET_CAPACITY_REASON,
  tn: FLEET_CAPACITY_REASON,
  ary: FLEET_CAPACITY_REASON,
  'ar-dz': FLEET_CAPACITY_REASON,
  ig: FLEET_CAPACITY_REASON,
  yo: FLEET_CAPACITY_REASON,
  ha: FLEET_CAPACITY_REASON,
  nae: FLEET_CAPACITY_REASON,
  rw: FLEET_CAPACITY_REASON,
};

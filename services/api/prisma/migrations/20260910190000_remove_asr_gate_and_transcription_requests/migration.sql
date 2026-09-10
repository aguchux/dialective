-- Removes the ASR-availability gate and its supporting machinery
-- (AsrTranscriptionRequest table, PlatformSettings.asrGateGloballyBypassed).
-- Investigation showed WordRecording.score (SCORED status, payout
-- eligibility) comes entirely from typed-transcript exact-match + peer
-- reverse-validation, never from ASR -- ASR only ever fed an auxiliary,
-- non-gating asrMatchScore annotation. The gate blocked dialects that could
-- already train/score fine without any ASR checkpoint at all, so it and
-- the request-tracking/bypass workaround built around it are removed
-- rather than kept as dead weight.
DROP TABLE "asr_transcription_requests";
DROP TYPE "AsrTranscriptionRequestStatus";

ALTER TABLE "platform_settings" DROP COLUMN "asrGateGloballyBypassed";

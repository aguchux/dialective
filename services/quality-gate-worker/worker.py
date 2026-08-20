import json
import logging
import os
import subprocess

import redis
import soundfile as sf

from db import build_db_connection, reject_submission, write_scores
from liveness import compute_liveness_score, load_model
from noise import compute_noise_score
from quality import compute_quality_score
from spaces import build_spaces_client
from streams import StreamConsumer, publish

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("quality-gate-worker")

REDIS_HOST = os.environ.get("REDIS_HOST", "redis")
REDIS_PORT = int(os.environ.get("REDIS_PORT", "6379"))
QUALITY_GATE_STREAM = os.environ.get("QUALITY_GATE_STREAM", "quality-gate-jobs")
CONSUMER_GROUP = os.environ.get("CONSUMER_GROUP", "quality-gate-workers")
CONSUMER_NAME = os.environ.get("HOSTNAME", "quality-gate-worker-1")

# Same duration/silence prefilter as vosk-worker/whisper-worker (design doc
# §5.1) -- kept as the one hard gate this worker enforces, unchanged. See
# AGENTS.md's note that this pre-filter is a meaningful cost/quality gate,
# not to be skipped.
MIN_DURATION_S = 0.5
MAX_DURATION_S = 15.0
MAX_SILENCE_RATIO = 0.9


def transcode_to_wav(src_path: str, dst_path: str, sr: int = 16000) -> None:
    """Identical to vosk-worker's transcode_to_wav -- see that module's comment for why ffmpeg is needed here."""
    subprocess.run(
        ["ffmpeg", "-y", "-i", src_path, "-ar", str(sr), "-ac", "1", "-f", "wav", dst_path],
        check=True,
        capture_output=True,
    )


def prefilter_ok(audio_path: str, max_duration_s: float | None = None) -> tuple[bool, str | None]:
    """
    max_duration_s, when given, overrides the module-level MAX_DURATION_S --
    submissions.controller.ts computes and passes this per-prompt (see its
    quality-gate-jobs publish comment) so a paragraph-length dictation
    Prompt gets a realistic recording window instead of the flat 15s
    default. word_recording jobs never set this field, so they keep using
    the module constant unchanged. MIN_DURATION_S is never overridden --
    audio is never too short because a prompt is long, only potentially too
    long, so there's no equivalent per-prompt floor to compute.
    """
    data, sr = sf.read(audio_path)
    duration = len(data) / sr
    effective_max = max_duration_s if max_duration_s is not None else MAX_DURATION_S
    if duration < MIN_DURATION_S or duration > effective_max:
        return False, "duration_out_of_range"
    silence_ratio = (abs(data) < 0.01).mean()
    if silence_ratio > MAX_SILENCE_RATIO:
        return False, "mostly_silence"
    return True, None


def compute_scores(audio_path: str, liveness_model) -> tuple[float, float, float]:
    data, sr = sf.read(audio_path)
    noise_score = compute_noise_score(data, sr)
    quality_score = compute_quality_score(data, sr)
    liveness_score = compute_liveness_score(data, sr, model=liveness_model)
    return noise_score, quality_score, liveness_score


def make_handler(s3, redis_client: redis.Redis, db_conn, liveness_model):
    def handle(_msg_id: str, fields: dict) -> None:
        job = fields if not fields.get("data") else json.loads(fields["data"])
        record_kind = job["record_kind"]
        record_id = job["submission_id"] if record_kind == "submission" else job["word_recording_id"]
        raw_path = f"/tmp/{record_kind}-{record_id}.raw"
        wav_path = f"/tmp/{record_kind}-{record_id}.wav"

        try:
            s3.download_file(job["bucket"], job["audio_key"], raw_path)

            try:
                transcode_to_wav(raw_path, wav_path)
            except subprocess.CalledProcessError:
                # Only Submissions have a REJECTED path -- WordRecording has
                # no equivalent prefilter-reject flow today (see
                # AGENTS.md/schema comment: "no ASR step, TRANSCRIBED/
                # REJECTED unused here"). An unreadable word-recording clip
                # simply gets no scores written (stays null), same
                # graceful-absence handling settlement-job already applies.
                if record_kind == "submission":
                    reject_submission(db_conn, record_id, "unreadable_audio")
                else:
                    logger.warning("Unreadable audio for word_recording=%s; leaving scores unset", record_id)
                return

            max_duration_s = float(job["max_duration_s"]) if job.get("max_duration_s") else None
            ok, reason = prefilter_ok(wav_path, max_duration_s)
            if not ok:
                if record_kind == "submission":
                    reject_submission(db_conn, record_id, reason)
                else:
                    logger.warning("word_recording=%s failed prefilter (%s); leaving scores unset", record_id, reason)
                return

            noise_score, quality_score, liveness_score = compute_scores(wav_path, liveness_model)
            write_scores(
                db_conn,
                record_kind,
                record_id,
                noise_score=noise_score,
                quality_score=quality_score,
                liveness_score=liveness_score,
            )

            asr_stream = job.get("asr_stream")
            if asr_stream:
                if record_kind == "submission":
                    asr_payload = {
                        "submission_id": record_id,
                        "prompt_id": job["prompt_id"],
                        "dialect_tag": job["dialect_tag"],
                        "bucket": job["bucket"],
                        "audio_key": job["audio_key"],
                    }
                    if job.get("max_duration_s"):
                        # Forwarded so vosk-worker's own (redundant but
                        # present) prefilter doesn't reject audio this
                        # worker's prefilter already accepted against the
                        # same per-prompt duration allowance.
                        asr_payload["max_duration_s"] = job["max_duration_s"]
                else:
                    # word_recording jobs have no prompt_id/consensus concept
                    # -- expected_text (the trainer's own typed answer) is
                    # what vosk-worker/whisper-worker compares the transcript
                    # against for asr_match_score. See words.service.ts's
                    # quality-gate-jobs publish, the origin of this field.
                    asr_payload = {
                        "word_recording_id": record_id,
                        "dialect_tag": job["dialect_tag"],
                        "expected_text": job["expected_text"],
                        "bucket": job["bucket"],
                        "audio_key": job["audio_key"],
                    }
                publish(redis_client, asr_stream, asr_payload)
        finally:
            for path in (raw_path, wav_path):
                if os.path.exists(path):
                    os.remove(path)

    return handle


def main() -> None:
    redis_client = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, decode_responses=True)
    s3 = build_spaces_client()
    db_conn = build_db_connection()
    liveness_model = load_model()

    consumer = StreamConsumer(redis_client, QUALITY_GATE_STREAM, CONSUMER_GROUP, CONSUMER_NAME)
    logger.info("quality-gate-worker consuming stream=%s group=%s", QUALITY_GATE_STREAM, CONSUMER_GROUP)
    consumer.run(make_handler(s3, redis_client, db_conn, liveness_model))


if __name__ == "__main__":
    main()

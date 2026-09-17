import json
import logging
import os
import subprocess

import redis
import soundfile as sf

from db import (
    build_db_connection,
    get_speech_expression_enabled,
    reject_domain_conversation_recording,
    reject_submission,
    reject_word_recording,
    write_expression,
    write_scores,
)
from expression import (
    bucket_energy,
    bucket_speed,
    compute_emotion,
    extract_prosody_metrics,
    load_emotion_model,
)
from liveness import compute_liveness_score, load_model
from noise import compute_noise_score
from quality import compute_quality_score
from spaces import build_spaces_client
from streams import StreamConsumer, publish

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("quality-gate-worker")

REDIS_HOST = os.environ.get("REDIS_HOST", "redis")
REDIS_PORT = int(os.environ.get("REDIS_PORT", "6379"))
# Optional: unset means no AUTH/TLS (today's default, safe before requirepass
# is turned on). See k8s/base/redis.yaml's requirepass + TLS listener
# rollout -- every Redis client across the fleet reads these same env vars.
REDIS_PASSWORD = os.environ.get("REDIS_PASSWORD") or None
REDIS_TLS = os.environ.get("REDIS_TLS", "").lower() == "true"
# Only set when connecting across the public internet (GCP -> DO's
# redis-external) against DO's self-signed cert -- see vosk-worker/worker.py.
REDIS_TLS_CA = os.environ.get("REDIS_TLS_CA") or None
QUALITY_GATE_STREAM = os.environ.get("QUALITY_GATE_STREAM", "quality-gate-jobs")
CONSUMER_GROUP = os.environ.get("CONSUMER_GROUP", "quality-gate-workers")
# Per-cluster prefix so GCP and DO pods never share a Redis consumer
# identity -- see whisper-worker/worker.py for the full reasoning. Empty by
# default, so DO's names are unchanged; the GCP overlay sets CONSUMER_PREFIX.
CONSUMER_PREFIX = os.environ.get("CONSUMER_PREFIX", "")
CONSUMER_NAME = f"{CONSUMER_PREFIX}{os.environ.get('HOSTNAME', 'quality-gate-worker-1')}"

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
        [
            "ffmpeg",
            "-y",
            "-i",
            src_path,
            "-ar",
            str(sr),
            "-ac",
            "1",
            "-f",
            "wav",
            dst_path,
        ],
        check=True,
        capture_output=True,
    )


def prefilter_ok(
    audio_path: str, max_duration_s: float | None = None
) -> tuple[bool, str | None]:
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


def compute_scores(
    audio_path: str, liveness_model, *, expression_enabled: bool, emotion_model
) -> dict:
    """
    Returns a dict rather than a fixed tuple -- the expression fields are
    conditional on expression_enabled, so a growing tuple stopped scaling
    once a 4th/5th value became optional rather than always-present.
    """
    data, sr = sf.read(audio_path)
    result = {
        "noise_score": compute_noise_score(data, sr),
        "quality_score": compute_quality_score(data, sr),
        "liveness_score": compute_liveness_score(data, sr, model=liveness_model),
    }
    if expression_enabled:
        prosody = extract_prosody_metrics(data, sr)
        emotion_label, emotion_confidence = compute_emotion(
            data, sr, model=emotion_model
        )
        result["expression"] = {
            "emotion": emotion_label,
            "emotion_confidence": emotion_confidence,
            "tone": None,  # tone/style are not derivable from acoustic-only signal analysis alone in this first pass -- left null until a classifier for them exists, same "computed but not every field populated" posture as asrConfidence being null for Whisper
            "style": None,
            "speed": bucket_speed(prosody["speechRateEstimate"]),
            "energy": bucket_energy(prosody["meanRmsDb"]),
            "prosody_metrics": prosody,
        }
    return result


def reject_record(db_conn, record_kind: str, record_id: str, reason: str) -> None:
    """
    Dispatches the REJECTED-write to the right table for whichever of the
    three record kinds this job is -- domain_conversation_recording has its
    own table/columns (see DomainConversationRecording in schema.prisma)
    and must NOT fall into reject_word_recording's word_recordings UPDATE,
    which would silently match 0 rows against the wrong table.
    """
    if record_kind == "submission":
        reject_submission(db_conn, record_id, reason)
    elif record_kind == "domain_conversation_recording":
        reject_domain_conversation_recording(db_conn, record_id, reason)
    else:
        reject_word_recording(db_conn, record_id, reason)


def make_handler(s3, redis_client: redis.Redis, db_conn, liveness_model, emotion_model):
    def handle(_msg_id: str, fields: dict) -> None:
        job = fields if not fields.get("data") else json.loads(fields["data"])
        record_kind = job["record_kind"]
        record_id = (
            job["submission_id"]
            if record_kind == "submission"
            else job["word_recording_id"]
        )
        raw_path = f"/tmp/{record_kind}-{record_id}.raw"
        wav_path = f"/tmp/{record_kind}-{record_id}.wav"

        try:
            s3.download_file(job["bucket"], job["audio_key"], raw_path)

            try:
                transcode_to_wav(raw_path, wav_path)
            except subprocess.CalledProcessError:
                # All three record kinds share the same hard-reject path --
                # settlement-job's refundRejectedSubmissions()/
                # refundRejectedWordRecordings()/
                # refundRejectedDomainConversationRecordings() sweeps pick
                # this up and release the trainer's locked tokens, then
                # delete the audio object immediately (see
                # settlement.service.ts).
                reject_record(db_conn, record_kind, record_id, "unreadable_audio")
                return

            max_duration_s = (
                float(job["max_duration_s"]) if job.get("max_duration_s") else None
            )
            ok, reason = prefilter_ok(wav_path, max_duration_s)
            if not ok:
                reject_record(db_conn, record_kind, record_id, reason)
                return

            expression_enabled = (
                get_speech_expression_enabled(db_conn)
                # domain_conversation_recordings has no emotion/tone/style/
                # speed/energy/prosodyMetrics columns at all (see its
                # schema.prisma model) -- write_expression would silently
                # no-op against the wrong table for this kind, so skip the
                # analysis entirely rather than compute output with nowhere
                # correct to write it.
                and record_kind != "domain_conversation_recording"
            )
            scores = compute_scores(
                wav_path,
                liveness_model,
                expression_enabled=expression_enabled,
                emotion_model=emotion_model,
            )
            write_scores(
                db_conn,
                record_kind,
                record_id,
                noise_score=scores["noise_score"],
                quality_score=scores["quality_score"],
                liveness_score=scores["liveness_score"],
            )
            if expression_enabled:
                expr = scores["expression"]
                write_expression(
                    db_conn,
                    record_kind,
                    record_id,
                    emotion=expr["emotion"],
                    emotion_confidence=expr["emotion_confidence"],
                    tone=expr["tone"],
                    style=expr["style"],
                    speed=expr["speed"],
                    energy=expr["energy"],
                    prosody_metrics=expr["prosody_metrics"],
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
    redis_client = redis.Redis(
        host=REDIS_HOST,
        port=REDIS_PORT,
        password=REDIS_PASSWORD,
        ssl=REDIS_TLS,
        ssl_ca_certs=REDIS_TLS_CA,
        decode_responses=True,
    )
    s3 = build_spaces_client()
    db_conn = build_db_connection()
    liveness_model = load_model()
    # Loaded unconditionally at startup (this pod is long-lived, KEDA-scaled)
    # rather than lazily on first use -- speechExpressionEnabled is checked
    # per-job instead (see get_speech_expression_enabled), so a toggle takes
    # effect without a worker restart while still paying the model-load cost
    # only once per pod lifetime.
    emotion_model = load_emotion_model()

    consumer = StreamConsumer(
        redis_client, QUALITY_GATE_STREAM, CONSUMER_GROUP, CONSUMER_NAME
    )
    logger.info(
        "quality-gate-worker consuming stream=%s group=%s",
        QUALITY_GATE_STREAM,
        CONSUMER_GROUP,
    )
    consumer.run(make_handler(s3, redis_client, db_conn, liveness_model, emotion_model))


if __name__ == "__main__":
    main()

import json
import logging
import os
import subprocess

import redis
from transformers import pipeline

from db import (
    build_db_connection,
    get_hf_token,
    update_submission_result,
    update_word_recording_result,
)
from model_registry import UnsupportedDialectError, load_registry, resolve_checkpoint
from spaces import build_spaces_client
from streams import StreamConsumer, publish

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("whisper-worker")

REDIS_HOST = os.environ.get("REDIS_HOST", "redis")
REDIS_PORT = int(os.environ.get("REDIS_PORT", "6379"))
ASR_STREAM = os.environ.get("ASR_STREAM", "asr-jobs-whisper")
CONSENSUS_STREAM = os.environ.get("CONSENSUS_STREAM", "consensus-jobs")
CONSUMER_GROUP = os.environ.get("CONSUMER_GROUP", "asr-workers-whisper")
CONSUMER_NAME = os.environ.get("HOSTNAME", "whisper-worker-1")

# CPU-only inference, matching the rest of this repo's GPU boundary
# (AGENTS.md "MMS-TTS boundary" applies the same reasoning here) -- plain HF
# transformers pipeline, not faster-whisper/CTranslate2, since the
# NCAIR1 Igbo/Yoruba/Hausa checkpoints are transformers-format and these are
# short prompt-length clips (MIN/MAX_DURATION_S 0.5-15s), not a workload
# where the conversion step would pay for itself.
_DEVICE = "cpu"
_MODEL_CACHE_DIR = "/models"

_registry = load_registry()
_pipeline_cache: dict[str, "pipeline"] = {}


def get_pipeline(dialect_tag: str, db_conn):
    """
    hf_token is resolved per-call (not once at startup) so a token an admin
    saves/rotates via the API Access Tokens settings tab takes effect for the
    next uncached dialect without a pod restart -- see db.py's get_hf_token,
    which has its own short TTL cache so this isn't a DB round-trip on every
    job. Passed explicitly as pipeline()'s `token` kwarg rather than relying
    on transformers' own HF_TOKEN env var lookup, since the token may now
    live only in Postgres (ApiAccessToken), never touching this process's
    environment at all.
    """
    if dialect_tag not in _pipeline_cache:
        checkpoint = resolve_checkpoint(dialect_tag, _registry)
        try:
            _pipeline_cache[dialect_tag] = pipeline(
                task="automatic-speech-recognition",
                model=checkpoint,
                device=_DEVICE,
                model_kwargs={"cache_dir": _MODEL_CACHE_DIR},
                return_timestamps="word",
                token=get_hf_token(db_conn),
            )
        except Exception as exc:
            # A gated/private HF repo with a missing-or-unauthorized token
            # raises deep inside transformers/huggingface_hub (GatedRepoError
            # wrapped in an OSError) -- streams.py's handler already logs the
            # full traceback on failure, but that's easy to miss in a
            # KEDA-scaled-to-zero worker's logs between bursts. This
            # single greppable line (ASR_CHECKPOINT_AUTH_FAILURE) is what
            # should be alerted on, since every job for this dialect will
            # keep failing identically until the token is fixed -- unlike a
            # one-off transient error, retrying does not help.
            if (
                "gated repo" in str(exc).lower()
                or "401" in str(exc)
                or "403" in str(exc)
            ):
                logger.error(
                    "ASR_CHECKPOINT_AUTH_FAILURE dialect=%s checkpoint=%s -- Hugging Face rejected the request "
                    "(gated repo or missing/invalid token). Every ASR job for this dialect will keep failing until "
                    "the token is fixed in Admin Settings > API Access Tokens or HF_TOKEN. error=%s",
                    dialect_tag,
                    checkpoint,
                    exc,
                )
            raise
    return _pipeline_cache[dialect_tag]


def transcode_to_wav(src_path: str, dst_path: str, sr: int = 16000) -> None:
    """
    Same normalization vosk-worker does -- trainer clients upload whatever
    MediaRecorder produces (webm/opus, browser-dependent); the HF pipeline
    is happiest given a clean 16kHz mono WAV rather than relying on its own
    format sniffing for every possible browser output.
    """
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


def word_detail_from_chunks(chunks: list) -> list:
    """
    HF's ASR pipeline, called with return_timestamps="word", returns
    {"text": ..., "chunks": [{"text": word, "timestamp": (start, end)}, ...]}.
    Reshape to the same {word, start, end, conf} shape vosk-worker persists,
    with conf always None -- Whisper has no per-word confidence signal.
    """
    return [
        {
            "word": chunk["text"].strip(),
            "start": chunk["timestamp"][0],
            "end": chunk["timestamp"][1],
            "conf": None,
        }
        for chunk in chunks
        if chunk.get("timestamp")
        and chunk["timestamp"][0] is not None
        and chunk["timestamp"][1] is not None
    ]


RESULT_TTL_S = 24 * 60 * 60


def write_result(redis_client: redis.Redis, submission_id: str, **fields) -> None:
    # Redis scratch key stays -- it's the fast client-poll mechanism for "is
    # my ASR done yet" (api's GET /submissions/:id/result), separate from
    # the Submission row's longer-lived consensus/settlement lifecycle
    # written by update_submission_result below. Mirrors vosk-worker's
    # write_result -- keep both in sync with whatever
    # submissions.controller.ts's getResult expects to parse.
    logger.info("write_result submission=%s fields=%s", submission_id, fields)
    redis_client.set(f"result:{submission_id}", json.dumps(fields), ex=RESULT_TTL_S)


def write_submission_row(db_conn, submission_id: str, status: str, **fields) -> None:
    status_map = {
        "rejected": "REJECTED",
        "unsupported_dialect": "REJECTED",
        "ok": "TRANSCRIBED",
    }
    # Whisper's HF pipeline never returns per-word confidence -- asr_confidence
    # stays None (not 0) to distinguish "no confidence data" from "zero
    # confidence", matching vosk-worker's mean_confidence(None) behavior.
    word_detail = fields.get("word_detail")
    update_submission_result(
        db_conn,
        submission_id,
        status=status_map[status],
        transcript=fields.get("transcript"),
        asr_confidence=None,
        asr_engine="whisper" if status != "unsupported_dialect" else None,
        asr_word_detail=word_detail if word_detail else None,
        rejection_reason=fields.get("reason")
        or ("unsupported_dialect" if status == "unsupported_dialect" else None),
    )


def handle_word_recording_job(s3, db_conn, job: dict) -> None:
    """
    ASR for a WordRecording -- pure annotation, no status/scoring gate, no
    consensus forwarding (WordRecording has no quorum concept). Silently
    does nothing on transcode/unsupported-dialect failure, same
    graceful-absence posture quality-gate-worker already established for
    this model (no REJECTED-equivalent path exists here, and no separate
    prefilter -- the Whisper submission path doesn't run one either).
    """
    word_recording_id = job["word_recording_id"]
    dialect_tag = job["dialect_tag"]
    raw_path = f"/tmp/word-{word_recording_id}.raw"
    wav_path = f"/tmp/word-{word_recording_id}.wav"

    try:
        s3.download_file(job["bucket"], job["audio_key"], raw_path)

        try:
            transcode_to_wav(raw_path, wav_path)
        except subprocess.CalledProcessError:
            logger.warning(
                "Unreadable audio for word_recording=%s; skipping ASR",
                word_recording_id,
            )
            return

        try:
            asr = get_pipeline(dialect_tag, db_conn)
        except UnsupportedDialectError:
            logger.info(
                "No whisper checkpoint for dialect=%s; skipping ASR for word_recording=%s",
                dialect_tag,
                word_recording_id,
            )
            return

        result = asr(wav_path)
        text = result.get("text", "").strip()
        word_detail = word_detail_from_chunks(result.get("chunks", []))
        update_word_recording_result(
            db_conn,
            word_recording_id,
            transcript=text,
            expected_text=job["expected_text"],
            word_detail=word_detail,
        )
    finally:
        for path in (raw_path, wav_path):
            if os.path.exists(path):
                os.remove(path)


def make_handler(s3, redis_client: redis.Redis, db_conn):
    def handle(_msg_id: str, fields: dict) -> None:
        job = fields if not fields.get("data") else json.loads(fields["data"])

        if "word_recording_id" in job:
            handle_word_recording_job(s3, db_conn, job)
            return

        submission_id = job["submission_id"]
        dialect_tag = job["dialect_tag"]
        raw_path = f"/tmp/{submission_id}.raw"
        wav_path = f"/tmp/{submission_id}.wav"

        try:
            s3.download_file(job["bucket"], job["audio_key"], raw_path)

            try:
                transcode_to_wav(raw_path, wav_path)
            except subprocess.CalledProcessError:
                write_result(
                    redis_client,
                    submission_id,
                    status="rejected",
                    reason="unreadable_audio",
                )
                write_submission_row(
                    db_conn, submission_id, "rejected", reason="unreadable_audio"
                )
                return

            try:
                asr = get_pipeline(dialect_tag, db_conn)
            except UnsupportedDialectError:
                write_result(
                    redis_client,
                    submission_id,
                    status="unsupported_dialect",
                    dialect_tag=dialect_tag,
                )
                write_submission_row(db_conn, submission_id, "unsupported_dialect")
                return

            result = asr(wav_path)
            text = result.get("text", "").strip()
            word_detail = word_detail_from_chunks(result.get("chunks", []))
            write_result(
                redis_client,
                submission_id,
                status="ok",
                transcript=text,
                word_confidences=word_detail,
            )
            write_submission_row(
                db_conn, submission_id, "ok", transcript=text, word_detail=word_detail
            )

            publish(
                redis_client,
                CONSENSUS_STREAM,
                {
                    "submission_id": submission_id,
                    "prompt_id": job["prompt_id"],
                    "dialect_tag": dialect_tag,
                },
            )
        finally:
            for path in (raw_path, wav_path):
                if os.path.exists(path):
                    os.remove(path)

    return handle


def main() -> None:
    redis_client = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, decode_responses=True)
    s3 = build_spaces_client()
    db_conn = build_db_connection()

    consumer = StreamConsumer(redis_client, ASR_STREAM, CONSUMER_GROUP, CONSUMER_NAME)
    logger.info(
        "whisper-worker consuming stream=%s group=%s", ASR_STREAM, CONSUMER_GROUP
    )
    consumer.run(make_handler(s3, redis_client, db_conn))


if __name__ == "__main__":
    main()

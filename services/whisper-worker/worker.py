import gc
import json
import logging
import os
import subprocess
from collections import OrderedDict

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
# Optional: unset means no AUTH/TLS (today's default, safe before requirepass
# is turned on). See k8s/base/redis.yaml's requirepass + TLS listener
# rollout -- every Redis client across the fleet reads these same env vars.
REDIS_PASSWORD = os.environ.get("REDIS_PASSWORD") or None
REDIS_TLS = os.environ.get("REDIS_TLS", "").lower() == "true"
# Only set when connecting across the public internet (GCP -> DO's
# redis-external) against DO's self-signed cert -- see vosk-worker/worker.py.
# Without it Python falls back to the system trust store, which correctly
# rejects that cert with CERTIFICATE_VERIFY_FAILED. In-cluster on DO this
# stays unset and plain `ssl=False` applies.
REDIS_TLS_CA = os.environ.get("REDIS_TLS_CA") or None
ASR_STREAM = os.environ.get("ASR_STREAM", "asr-jobs-whisper")
CONSENSUS_STREAM = os.environ.get("CONSENSUS_STREAM", "consensus-jobs")
CONSUMER_GROUP = os.environ.get("CONSUMER_GROUP", "asr-workers-whisper")
# Redis identifies a consumer by name alone, and GCP's StatefulSet produces
# the same pod names as DO's (whisper-worker-0, -1, ...) while both consume
# the SAME group on DO's Redis. Without a per-cluster prefix the two clusters'
# pod 0 are one consumer to Redis, so StreamConsumer._reclaim_stuck_entries'
# xautoclaim(min_idle_time=5min) lets one cluster reclaim and reprocess an
# entry the other is still mid-transcription on -- duplicate work, and
# times_delivered inflating toward the dead-letter cutoff on jobs that never
# actually failed. Defaults to empty so DO's existing consumer names are
# unchanged; the GCP overlay sets CONSUMER_PREFIX=gcp-.
CONSUMER_PREFIX = os.environ.get("CONSUMER_PREFIX", "")
CONSUMER_NAME = f"{CONSUMER_PREFIX}{os.environ.get('HOSTNAME', 'whisper-worker-1')}"

# CPU-only inference, matching the rest of this repo's GPU boundary
# (AGENTS.md "MMS-TTS boundary" applies the same reasoning here) -- plain HF
# transformers pipeline, not faster-whisper/CTranslate2, since the
# NCAIR1 Igbo/Yoruba/Hausa checkpoints are transformers-format and these are
# short prompt-length clips (MIN/MAX_DURATION_S 0.5-15s), not a workload
# where the conversion step would pay for itself.
_DEVICE = "cpu"
_MODEL_CACHE_DIR = "/models"

_registry = load_registry()
# OrderedDict so the oldest entry can be popped -- see get_pipeline's
# eviction comment for why this is bounded rather than a plain dict.
_pipeline_cache: "OrderedDict[str, pipeline]" = OrderedDict()

# How many loaded models one worker may hold at once. 2, not more: the pod
# limit is 3584Mi and a whisper-medium is ~3GB resident, so even two
# mediums do not fit -- this bounds the common case (smalls, ~1GB each)
# while letting a medium evict whatever preceded it instead of being
# stacked on top of it. Raising this without raising the memory limit
# reintroduces the OOMKill.
_MAX_CACHED_PIPELINES = 2

# Maps Whisper's d_model (encoder/decoder hidden size) to the matching
# openai/whisper-<size> checkpoint. Fine-tuning changes weights, not
# architecture, so a fine-tune's d_model always matches exactly one of
# these -- used to recover alignment_heads (see below) from the base model
# when a fine-tuned checkpoint's own generation_config.json omits it.
_WHISPER_SIZE_BY_D_MODEL = {
    384: "openai/whisper-tiny",
    512: "openai/whisper-base",
    768: "openai/whisper-small",
    1024: "openai/whisper-medium",
    1280: "openai/whisper-large-v3",
}


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
            asr_pipeline = pipeline(
                task="automatic-speech-recognition",
                model=checkpoint,
                device=_DEVICE,
                model_kwargs={"cache_dir": _MODEL_CACHE_DIR},
                return_timestamps="word",
                token=get_hf_token(db_conn),
            )
            # Some fine-tuned checkpoints (e.g. mbazaNLP/Whisper-Small-
            # Kinyarwanda) ship no generation_config.json at all, so
            # transformers falls back to a bare default GenerationConfig
            # missing Whisper-specific fields -- return_timestamps="word"
            # above then fails deep in generate() with "the generation
            # config is not properly set" (no_timestamps_token_id unset).
            # The <|notimestamps|> special token is fixed by Whisper's
            # tokenizer vocabulary regardless of fine-tune, so backfilling
            # it from the checkpoint's own tokenizer is safe and avoids
            # hardcoding the token id. See
            # https://github.com/huggingface/transformers/issues/21878.
            gen_config = asr_pipeline.model.generation_config
            if getattr(gen_config, "no_timestamps_token_id", None) is None:
                gen_config.no_timestamps_token_id = (
                    asr_pipeline.tokenizer.convert_tokens_to_ids("<|notimestamps|>")
                )
            # Same incomplete-generation_config.json gap as above:
            # return_timestamps="word" also needs alignment_heads (which
            # cross-attention heads' weights double as token-to-audio
            # alignment, used to derive word boundaries) -- a value that's
            # tied to the model's architecture, not its fine-tune, so it's
            # safe to borrow from the equivalently-sized base openai/whisper
            # checkpoint the fine-tune started from (matched by d_model,
            # since fine-tuning never changes hidden size/layer count). See
            # https://github.com/huggingface/transformers/issues/28187 and
            # https://gist.github.com/hollance/42e32852f24243b748ae6bc1f985b13a.
            if getattr(gen_config, "alignment_heads", None) is None:
                base_checkpoint = _WHISPER_SIZE_BY_D_MODEL.get(
                    asr_pipeline.model.config.d_model
                )
                if base_checkpoint is not None:
                    from transformers import GenerationConfig

                    base_gen_config = GenerationConfig.from_pretrained(base_checkpoint)
                    gen_config.alignment_heads = base_gen_config.alignment_heads
            # Evict before inserting, so the cache never holds more than
            # _MAX_CACHED_PIPELINES models at once. This cache was
            # unbounded and keyed by dialect, which was survivable while
            # every registered checkpoint was a ~1GB whisper-small: three
            # dialects fitted inside the pod's 3584Mi limit. Registering
            # medium-sized checkpoints (zu, ary at ~3GB resident each)
            # broke that assumption and the pods started OOMKilling
            # mid-inference -- taking down yo/ha/ig, which had worked for
            # months, along with the new dialects.
            #
            # FIFO rather than LRU: the eviction only has to bound the
            # total, and a worker pulls jobs in whatever order the stream
            # delivers them, so there is no reuse pattern worth tracking.
            # A re-load costs a disk read from /models, not a re-download.
            while len(_pipeline_cache) >= _MAX_CACHED_PIPELINES:
                evicted, _ = _pipeline_cache.popitem(last=False)
                logger.info(
                    "Evicting cached ASR pipeline for dialect=%s to stay under "
                    "the %d-model cache limit",
                    evicted,
                    _MAX_CACHED_PIPELINES,
                )
            gc.collect()
            _pipeline_cache[dialect_tag] = asr_pipeline
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


def transcribe(asr_pipeline, wav_path: str) -> dict:
    """
    Runs the pipeline with return_timestamps="word" (set at pipeline-build
    time in get_pipeline) for per-word confidence detail, falling back to a
    plain transcript if that raises -- some fine-tuned checkpoints (verified
    directly against mbazaNLP/Whisper-Small-Kinyarwanda) crash inside
    transformers' DTW-based _extract_token_timestamps with a tensor shape
    mismatch, even after backfilling alignment_heads from the equivalently-
    sized base Whisper checkpoint (see get_pipeline): the base model's
    alignment heads don't necessarily still align well after fine-tuning.
    Confirmed this is a per-checkpoint limitation, not audio-specific --
    the same checkpoint transcribes correctly via plain text on the exact
    clip that crashes with word timestamps requested. Result stays the same
    shape either way ({"text": ..., "chunks": [...]}); "chunks" is simply
    absent (word_detail_from_chunks already treats missing/empty as no
    detail, the same "measured but never scored" posture as elsewhere).
    """
    try:
        return asr_pipeline(wav_path)
    except RuntimeError as exc:
        if "expanded size of the tensor" not in str(exc):
            raise
        logger.warning(
            "Word-level timestamp extraction failed for this checkpoint "
            "(tensor shape mismatch in Whisper's DTW alignment); retrying "
            "without timestamps. error=%s",
            exc,
        )
        return asr_pipeline(wav_path, return_timestamps=False)


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

        result = transcribe(asr, wav_path)
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

            result = transcribe(asr, wav_path)
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

    consumer = StreamConsumer(redis_client, ASR_STREAM, CONSUMER_GROUP, CONSUMER_NAME)
    logger.info(
        "whisper-worker consuming stream=%s group=%s", ASR_STREAM, CONSUMER_GROUP
    )
    consumer.run(make_handler(s3, redis_client, db_conn))


if __name__ == "__main__":
    main()

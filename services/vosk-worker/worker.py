import json
import logging
import os
import subprocess

import redis
import soundfile as sf
from vosk import KaldiRecognizer, Model

from db import build_db_connection, mean_confidence, update_submission_result
from model_registry import UnsupportedDialectError, load_registry, resolve_model_path
from spaces import build_spaces_client
from streams import StreamConsumer, publish

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("vosk-worker")

REDIS_HOST = os.environ.get("REDIS_HOST", "redis")
REDIS_PORT = int(os.environ.get("REDIS_PORT", "6379"))
ASR_STREAM = os.environ.get("ASR_STREAM", "asr-jobs-vosk")
CONSENSUS_STREAM = os.environ.get("CONSENSUS_STREAM", "consensus-jobs")
CONSUMER_GROUP = os.environ.get("CONSUMER_GROUP", "asr-workers-vosk")
CONSUMER_NAME = os.environ.get("HOSTNAME", "vosk-worker-1")

MIN_DURATION_S = 0.5
MAX_DURATION_S = 15.0
MAX_SILENCE_RATIO = 0.9

_registry = load_registry()
_model_cache: dict[str, Model] = {}


def get_model(dialect_tag: str) -> Model:
    if dialect_tag not in _model_cache:
        path = resolve_model_path(dialect_tag, _registry)
        _model_cache[dialect_tag] = Model(path)
    return _model_cache[dialect_tag]


def transcode_to_wav(src_path: str, dst_path: str, sr: int = 16000) -> None:
    """
    Trainer clients upload whatever MediaRecorder gives them (webm/opus,
    ogg, etc, browser-dependent) -- soundfile/libsndfile can't decode most
    of those directly, so normalize to 16kHz mono PCM WAV via the ffmpeg
    binary already baked into this image (see Dockerfile) before anything
    downstream touches the file.
    """
    subprocess.run(
        ["ffmpeg", "-y", "-i", src_path, "-ar", str(sr), "-ac", "1", "-f", "wav", dst_path],
        check=True,
        capture_output=True,
    )


def prefilter_ok(audio_path: str) -> tuple[bool, str | None]:
    """Duration/silence check before spending ASR time (design doc §5.1)."""
    data, sr = sf.read(audio_path)
    duration = len(data) / sr
    if duration < MIN_DURATION_S or duration > MAX_DURATION_S:
        return False, "duration_out_of_range"
    silence_ratio = (abs(data) < 0.01).mean()
    if silence_ratio > MAX_SILENCE_RATIO:
        return False, "mostly_silence"
    return True, None


def transcribe(audio_path: str, model: Model, sr: int = 16000) -> tuple[str, list]:
    rec = KaldiRecognizer(model, sr)
    data, _ = sf.read(audio_path, dtype="int16")
    rec.AcceptWaveform(data.tobytes())
    result = json.loads(rec.FinalResult())
    return result.get("text", ""), result.get("result", [])


RESULT_TTL_S = 24 * 60 * 60


def write_result(redis_client: redis.Redis, submission_id: str, **fields) -> None:
    # Redis scratch key stays -- it's the fast client-poll mechanism for "is
    # my ASR done yet" (api's GET /submissions/:id/result), separate from
    # the Submission row's longer-lived consensus/settlement lifecycle
    # written by update_submission_result below.
    logger.info("write_result submission=%s fields=%s", submission_id, fields)
    redis_client.set(f"result:{submission_id}", json.dumps(fields), ex=RESULT_TTL_S)


def write_submission_row(db_conn, submission_id: str, status: str, **fields) -> None:
    status_map = {"rejected": "REJECTED", "unsupported_dialect": "REJECTED", "ok": "TRANSCRIBED"}
    word_conf = fields.get("word_confidences")
    update_submission_result(
        db_conn,
        submission_id,
        status=status_map[status],
        transcript=fields.get("transcript"),
        asr_confidence=mean_confidence(word_conf) if word_conf is not None else None,
        asr_engine="vosk" if status != "unsupported_dialect" else None,
        rejection_reason=fields.get("reason") or ("unsupported_dialect" if status == "unsupported_dialect" else None),
    )


def make_handler(s3, redis_client: redis.Redis, db_conn):
    def handle(_msg_id: str, fields: dict) -> None:
        job = fields if not fields.get("data") else json.loads(fields["data"])
        submission_id = job["submission_id"]
        dialect_tag = job["dialect_tag"]
        raw_path = f"/tmp/{submission_id}.raw"
        wav_path = f"/tmp/{submission_id}.wav"

        try:
            s3.download_file(job["bucket"], job["audio_key"], raw_path)

            try:
                transcode_to_wav(raw_path, wav_path)
            except subprocess.CalledProcessError:
                write_result(redis_client, submission_id, status="rejected", reason="unreadable_audio")
                write_submission_row(db_conn, submission_id, "rejected", reason="unreadable_audio")
                return

            ok, reason = prefilter_ok(wav_path)
            if not ok:
                write_result(redis_client, submission_id, status="rejected", reason=reason)
                write_submission_row(db_conn, submission_id, "rejected", reason=reason)
                return

            try:
                model = get_model(dialect_tag)
            except UnsupportedDialectError:
                write_result(redis_client, submission_id, status="unsupported_dialect", dialect_tag=dialect_tag)
                write_submission_row(db_conn, submission_id, "unsupported_dialect")
                return

            text, word_conf = transcribe(wav_path, model)
            write_result(redis_client, submission_id, status="ok", transcript=text, word_confidences=word_conf)
            write_submission_row(db_conn, submission_id, "ok", transcript=text, word_confidences=word_conf)

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
    logger.info("vosk-worker consuming stream=%s group=%s", ASR_STREAM, CONSUMER_GROUP)
    consumer.run(make_handler(s3, redis_client, db_conn))


if __name__ == "__main__":
    main()

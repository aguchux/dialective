import json
import logging
import os

import redis
import soundfile as sf
from vosk import KaldiRecognizer, Model

from model_registry import UnsupportedDialectError, load_registry, resolve_model_path
from spaces import build_spaces_client
from streams import StreamConsumer, publish

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("vosk-worker")

REDIS_HOST = os.environ.get("REDIS_HOST", "redis")
REDIS_PORT = int(os.environ.get("REDIS_PORT", "6379"))
ASR_STREAM = os.environ.get("ASR_STREAM", "asr-jobs")
CONSENSUS_STREAM = os.environ.get("CONSENSUS_STREAM", "consensus-jobs")
CONSUMER_GROUP = os.environ.get("CONSUMER_GROUP", "asr-workers")
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


def write_result(submission_id: str, **fields) -> None:
    # TODO: write to Postgres submissions.transcript / asr_confidence, once
    # the Postgres schema (Project Plan step 2) exists.
    logger.info("write_result submission=%s fields=%s", submission_id, fields)


def make_handler(s3, redis_client: redis.Redis):
    def handle(_msg_id: str, fields: dict) -> None:
        job = fields if not fields.get("data") else json.loads(fields["data"])
        submission_id = job["submission_id"]
        dialect_tag = job["dialect_tag"]
        local_path = f"/tmp/{submission_id}.wav"

        try:
            s3.download_file(job["bucket"], job["audio_key"], local_path)

            ok, reason = prefilter_ok(local_path)
            if not ok:
                write_result(submission_id, status="rejected", reason=reason)
                return

            try:
                model = get_model(dialect_tag)
            except UnsupportedDialectError:
                write_result(submission_id, status="unsupported_dialect", dialect_tag=dialect_tag)
                return

            text, word_conf = transcribe(local_path, model)
            write_result(submission_id, transcript=text, word_confidences=word_conf)

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
            if os.path.exists(local_path):
                os.remove(local_path)

    return handle


def main() -> None:
    redis_client = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, decode_responses=True)
    s3 = build_spaces_client()

    consumer = StreamConsumer(redis_client, ASR_STREAM, CONSUMER_GROUP, CONSUMER_NAME)
    logger.info("vosk-worker consuming stream=%s group=%s", ASR_STREAM, CONSUMER_GROUP)
    consumer.run(make_handler(s3, redis_client))


if __name__ == "__main__":
    main()

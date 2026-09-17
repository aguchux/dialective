import io
import logging
import os
import uuid

import redis
import scipy.io.wavfile
import torch
from transformers import VitsModel, VitsTokenizer

from model_registry import UnsupportedDialectError, load_registry, resolve_checkpoint
from spaces import build_spaces_client
from streams import StreamConsumer

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("prompt-audio-service")

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
# rejects that cert with CERTIFICATE_VERIFY_FAILED.
REDIS_TLS_CA = os.environ.get("REDIS_TLS_CA") or None
PROMPT_AUDIO_STREAM = os.environ.get("PROMPT_AUDIO_STREAM", "prompt-audio-jobs")
CONSUMER_GROUP = os.environ.get("CONSUMER_GROUP", "prompt-audio-workers")
# Per-cluster prefix so GCP and DO pods never share a Redis consumer
# identity -- see whisper-worker/worker.py for the full reasoning. Empty by
# default, so DO's names are unchanged; the GCP overlay sets CONSUMER_PREFIX.
CONSUMER_PREFIX = os.environ.get("CONSUMER_PREFIX", "")
CONSUMER_NAME = (
    f"{CONSUMER_PREFIX}{os.environ.get('HOSTNAME', 'prompt-audio-service-1')}"
)
PROMPT_AUDIO_BUCKET = os.environ.get(
    "SPACES_PROMPT_AUDIO_BUCKET", "dialectiva-prompt-audio"
)
SPACES_REGION = os.environ.get("SPACES_REGION", "nyc3")

_registry = load_registry()
_model_cache: dict[str, tuple[VitsModel, VitsTokenizer]] = {}

# CPU-only inference, matching the rest of this repo's GPU boundary
# (AGENTS.md "MMS-TTS boundary") -- do not move this to CUDA.
_DEVICE = "cpu"


def get_model(dialect_tag: str) -> tuple[VitsModel, VitsTokenizer]:
    if dialect_tag not in _model_cache:
        checkpoint = resolve_checkpoint(dialect_tag, _registry)
        model = VitsModel.from_pretrained(checkpoint, cache_dir="/models").to(_DEVICE)
        tokenizer = VitsTokenizer.from_pretrained(checkpoint, cache_dir="/models")
        _model_cache[dialect_tag] = (model, tokenizer)
    return _model_cache[dialect_tag]


def synthesize(text: str, model: VitsModel, tokenizer: VitsTokenizer) -> bytes:
    inputs = tokenizer(text, return_tensors="pt")
    with torch.no_grad():
        output = model(**inputs).waveform

    buf = io.BytesIO()
    scipy.io.wavfile.write(
        buf, rate=model.config.sampling_rate, data=output.squeeze().numpy()
    )
    return buf.getvalue()


def write_prompt_audio_url(prompt_id: str, url: str) -> None:
    # TODO: write the audio URL onto the prompt record in Postgres, once the
    # Postgres schema (Project Plan step 2) exists. Never inline audio bytes
    # into the DB (AGENTS.md "MMS-TTS boundary").
    logger.info("write_prompt_audio_url prompt=%s url=%s", prompt_id, url)


def make_handler(s3):
    def handle(_msg_id: str, job: dict) -> None:
        prompt_id = job["prompt_id"]
        dialect_tag = job["dialect_tag"]
        text = job["text"]

        try:
            model, tokenizer = get_model(dialect_tag)
        except UnsupportedDialectError:
            write_prompt_audio_url(prompt_id, "")  # marks unsupported_dialect
            logger.warning(
                "Unsupported dialect for prompt=%s dialect=%s", prompt_id, dialect_tag
            )
            return

        audio_bytes = synthesize(text, model, tokenizer)
        key = f"{prompt_id}/{uuid.uuid4()}.wav"
        # public-read: unlike submissions (trainer-uploaded, presigned-PUT-only),
        # prompt audio is meant to be played back by any trainer's client, so
        # the bucket/CDN in front of it is expected to serve it directly.
        s3.put_object(
            Bucket=PROMPT_AUDIO_BUCKET,
            Key=key,
            Body=audio_bytes,
            ContentType="audio/wav",
            ACL="public-read",
        )

        url = f"https://{PROMPT_AUDIO_BUCKET}.{SPACES_REGION}.digitaloceanspaces.com/{key}"
        write_prompt_audio_url(prompt_id, url)

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

    consumer = StreamConsumer(
        redis_client, PROMPT_AUDIO_STREAM, CONSUMER_GROUP, CONSUMER_NAME
    )
    logger.info(
        "prompt-audio-service consuming stream=%s group=%s",
        PROMPT_AUDIO_STREAM,
        CONSUMER_GROUP,
    )
    consumer.run(make_handler(s3))


if __name__ == "__main__":
    main()

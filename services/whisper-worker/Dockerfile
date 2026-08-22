FROM python:3.11-slim
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Build context must be repo root so models/asr-registry.yaml resolves, e.g.:
#   docker build -f services/whisper-worker/Dockerfile -t whisper-worker .
COPY services/whisper-worker/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Checkpoints (NCAIR1/Igbo-ASR, NCAIR1/Yoruba-ASR, NCAIR1/Hausa-ASR) are NOT
# baked into this image -- transformers' from_pretrained(cache_dir=...)
# downloads them lazily on first use into whisper-model-repo-pvc, mounted at
# /models, same pattern as prompt-audio-service's MMS-TTS checkpoints.
COPY services/whisper-worker/model_registry.py services/whisper-worker/streams.py services/whisper-worker/spaces.py services/whisper-worker/token_crypto.py services/whisper-worker/db.py services/whisper-worker/worker.py ./
COPY models/asr-registry.yaml ./models/asr-registry.yaml

CMD ["python3", "worker.py"]

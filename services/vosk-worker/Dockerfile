FROM python:3.11-slim
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Build context must be repo root so models/registry.yaml resolves, e.g.:
#   docker build -f services/vosk-worker/Dockerfile -t vosk-worker .
COPY services/vosk-worker/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Model weights are NOT baked into this image -- they live on
# asr-model-repo-pvc, mounted at /models and populated by an initContainer
# (see k8s/base/vosk-worker-deployment.yaml) so every replica shares one
# download instead of each image rebuild re-fetching it.
COPY services/vosk-worker/model_registry.py services/vosk-worker/streams.py services/vosk-worker/spaces.py services/vosk-worker/db.py services/vosk-worker/worker.py ./
COPY models/registry.yaml ./models/registry.yaml

CMD ["python3", "worker.py"]

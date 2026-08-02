FROM python:3.11-slim
WORKDIR /app

# Build context must be repo root so models/tts-registry.yaml resolves, e.g.:
#   docker build -f services/prompt-audio-service/Dockerfile -t prompt-audio-service .
COPY services/prompt-audio-service/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY services/prompt-audio-service/model_registry.py services/prompt-audio-service/streams.py services/prompt-audio-service/spaces.py services/prompt-audio-service/worker.py ./
COPY models/tts-registry.yaml ./models/tts-registry.yaml

CMD ["python3", "worker.py"]

FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY model_registry.py streams.py worker.py ./

# Build context must be repo root so ../../models resolves, e.g.:
#   docker build -f services/prompt-audio-service/Dockerfile -t prompt-audio-service .
COPY models/tts-registry.yaml ./models/tts-registry.yaml

CMD ["python3", "worker.py"]

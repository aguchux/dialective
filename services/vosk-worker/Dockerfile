FROM python:3.11-slim
RUN apt-get update && apt-get install -y ffmpeg wget unzip && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Build context must be repo root so models/registry.yaml resolves, e.g.:
#   docker build -f services/vosk-worker/Dockerfile -t vosk-worker .
COPY services/vosk-worker/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Model weights are NOT committed; fetch them per models/registry.yaml at
# image build time. Placeholder fetches the pilot's en-us model -- extend
# as more dialect_tags are added to the registry.
RUN wget https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip \
    && unzip vosk-model-small-en-us-0.15.zip -d /models \
    && rm vosk-model-small-en-us-0.15.zip

COPY services/vosk-worker/model_registry.py services/vosk-worker/streams.py services/vosk-worker/spaces.py services/vosk-worker/worker.py ./
COPY models/registry.yaml ./models/registry.yaml

CMD ["python3", "worker.py"]

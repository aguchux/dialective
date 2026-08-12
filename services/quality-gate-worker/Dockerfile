FROM python:3.11-slim
# build-essential is needed to compile webrtcvad's C extension (no prebuilt
# manylinux wheel exists for it) -- python:3.11-slim has no compiler by default.
RUN apt-get update && apt-get install -y ffmpeg build-essential && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Build context must be repo root, same as vosk-worker/whisper-worker:
#   docker build -f services/quality-gate-worker/Dockerfile -t quality-gate-worker .
COPY services/quality-gate-worker/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Unlike Vosk/Whisper's GB-scale models (PVC + initContainer/lazy-download),
# the liveness classifier is a KB-scale joblib artifact -- baked directly
# into the image, no PVC needed. See models/README.md for provenance notes.
COPY services/quality-gate-worker/streams.py services/quality-gate-worker/spaces.py services/quality-gate-worker/db.py services/quality-gate-worker/noise.py services/quality-gate-worker/quality.py services/quality-gate-worker/liveness.py services/quality-gate-worker/worker.py ./
COPY services/quality-gate-worker/models/liveness_classifier.joblib ./models/liveness_classifier.joblib

CMD ["python3", "worker.py"]

FROM python:3.11-slim
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Build context must be chatdialect/apps/agent, e.g.:
#   docker build -t chatdialect-agent chatdialect/apps/agent
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Whisper/MMS-TTS checkpoints are NOT baked into this image -- transformers'
# from_pretrained(cache_dir=...) downloads them lazily on first use into
# chatdialect-model-repo-pvc, mounted at /models, same pattern as
# whisper-worker's/prompt-audio-service's own PVC-backed model cache.
COPY src ./src

CMD ["python3", "src/agent.py", "start"]

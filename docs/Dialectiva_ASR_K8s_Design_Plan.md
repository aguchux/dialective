# Dialectiva ASR Pipeline — Design Plan
### CPU-Only MVP Architecture Using Vosk on Kubernetes

---

## 1. Purpose & Scope

This document specifies the design for Dialectiva's **voice scoring pipeline MVP**: the subsystem that takes a trainer's submitted audio, transcribes it, cross-validates it against other trainers in the same dialect cluster, and produces the 0–100% score that drives payout.

**Scope of this plan:** CPU-only deployment using **Vosk** (Kaldi-based ASR), suitable for the Phase 0 pilot (2–3 dialects, small trainer pool, manual QA backstop). It intentionally excludes GPU-based models (Whisper, Wav2Vec2-XLSR, MMS) — those are covered in §8 as the defined upgrade path once the pilot proves the product loop and generates enough labeled dialect data to justify fine-tuning infrastructure.

---

## 2. Design Principles

1. **No GPU dependency for MVP.** Every component must run on commodity CPU nodes so the pilot can launch without provisioning specialized infrastructure or absorbing GPU idle cost.
2. **Queue-driven, not request/response.** Submissions don't need real-time scoring — they have a 12–24h settlement window — so the system should batch and scale workers based on backlog, not sit idle at fixed capacity.
3. **Audio never touches pod-local disk long-term.** All raw audio lives in object storage; pods are stateless and disposable.
4. **Consensus scoring is decoupled from transcription.** The ASR step and the cross-trainer comparison step are separate services, so either can be upgraded (e.g., swapping Vosk for Whisper later) without touching the other.
5. **Everything scales to zero except the always-on control plane** (API, DB, queue) — worker pools scale with demand.

---

## 3. System Architecture

```
┌─────────────┐     upload      ┌──────────────────┐
│ Trainer App │ ───────────────▶│  Object Storage    │  (S3 / MinIO)
└─────────────┘                 │  raw audio bucket   │
       │                        └─────────┬──────────┘
       │ submit metadata                  │ event/notify
       ▼                                  ▼
┌─────────────────┐   enqueue job   ┌──────────────────┐
│   API Service    │ ───────────────▶│  Redis Streams    │
│ (task assign,    │                 │  "asr-jobs"       │
│  wallet, scoring  │                └─────────┬─────────┘
│  read models)    │                            │ consume
└─────────┬────────┘                            ▼
          │                          ┌────────────────────┐
          │                          │  Vosk ASR Workers   │  (CPU, KEDA-scaled)
          │                          │  Deployment          │
          │                          └─────────┬───────────┘
          │                                    │ transcript + confidence
          │                                    ▼
          │                          ┌────────────────────┐
          │                          │  Pre-filter check    │  (silence/noise/
          │                          │  (can run inside      │   duration/clipping)
          │                          │   same worker)        │
          │                          └─────────┬───────────┘
          │                                    │
          │                                    ▼
          │                          ┌────────────────────┐
          │                          │ Consensus Scoring    │  (CPU, HPA-scaled)
          │                          │ Service               │
          │                          └─────────┬───────────┘
          │                                    │ score 0–100%
          ▼                                    ▼
┌─────────────────────────────────────────────────────┐
│                PostgreSQL                              │
│  submissions, scores, wallet ledger, task history       │
└─────────────────────────────────────────────────────┘
```

---

## 4. Components

| Component | Type | Runs on | Notes |
|---|---|---|---|
| API service | Deployment + HPA (CPU) | Always-on | Task assignment, wallet, auth |
| Object storage | External (S3/GCS) or MinIO StatefulSet | Always-on | Raw audio, durable |
| Redis Streams | StatefulSet | Always-on, small | Job queue + consumer groups |
| Vosk ASR workers | Deployment, **KEDA-scaled 0→N** | On-demand, CPU only | Pulls jobs, transcribes, writes result |
| Consensus scoring service | Deployment + HPA (CPU) | Low, steady load | Compares transcripts within a dialect/prompt cluster |
| PostgreSQL | Managed DB or StatefulSet | Always-on | Source of truth for scores/ledger |
| Batch settlement job | CronJob (every 12–24h) | Scheduled | Finalizes scores → triggers payouts |

---

## 5. Vosk Worker Design

### 5.1 Responsibilities
1. Pop a job from the Redis stream (`{submission_id, audio_url, dialect_tag, prompt_text}`).
2. Download audio from object storage.
3. Run pre-filter checks: duration bounds, silence ratio, clipping/noise floor — reject obviously bad clips before spending ASR time.
4. Run Vosk transcription → produce `{transcript, word_confidences}`.
5. Write result to Postgres (`submissions.transcript`, `submissions.asr_confidence`).
6. Push a message to the `consensus-scoring` stream so the scoring service picks it up once enough submissions exist for that prompt/dialect cluster.
7. Ack the job.

### 5.2 Dockerfile

```dockerfile
FROM python:3.11-slim
RUN apt-get update && apt-get install -y ffmpeg wget unzip && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir vosk redis boto3 soundfile numpy

# Bake in the model(s) you need for your pilot dialects/languages.
# Swap the URL per language; for a true dialect you may need the closest
# available major-language model until you can fine-tune your own.
RUN wget https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip \
    && unzip vosk-model-small-en-us-0.15.zip -d /models \
    && rm vosk-model-small-en-us-0.15.zip

COPY worker.py /app/worker.py
WORKDIR /app
CMD ["python3", "worker.py"]
```

### 5.3 Worker logic (pseudocode)

```python
import json, redis, boto3, soundfile as sf
from vosk import Model, KaldiRecognizer

r = redis.Redis(host="redis", port=6379)
s3 = boto3.client("s3")
model = Model("/models/vosk-model-small-en-us-0.15")

GROUP = "asr-workers"
STREAM = "asr-jobs"

def prefilter_ok(audio_path):
    data, sr = sf.read(audio_path)
    duration = len(data) / sr
    if duration < 0.5 or duration > 15:
        return False, "duration_out_of_range"
    silence_ratio = (abs(data) < 0.01).mean()
    if silence_ratio > 0.9:
        return False, "mostly_silence"
    return True, None

def transcribe(audio_path, sr=16000):
    rec = KaldiRecognizer(model, sr)
    data, _ = sf.read(audio_path, dtype="int16")
    rec.AcceptWaveform(data.tobytes())
    result = json.loads(rec.FinalResult())
    return result.get("text", ""), result.get("result", [])

def main():
    while True:
        entries = r.xreadgroup(GROUP, "worker-1", {STREAM: ">"}, count=1, block=5000)
        if not entries:
            continue
        for stream, messages in entries:
            for msg_id, fields in messages:
                job = json.loads(fields[b"data"])
                local_path = f"/tmp/{job['submission_id']}.wav"
                s3.download_file(job["bucket"], job["audio_key"], local_path)

                ok, reason = prefilter_ok(local_path)
                if not ok:
                    write_result(job["submission_id"], status="rejected", reason=reason)
                    r.xack(STREAM, GROUP, msg_id)
                    continue

                text, word_conf = transcribe(local_path)
                write_result(job["submission_id"], transcript=text, word_conf=word_conf)
                r.xadd("consensus-jobs", {"data": json.dumps({
                    "submission_id": job["submission_id"],
                    "prompt_id": job["prompt_id"],
                    "dialect_tag": job["dialect_tag"]
                })})
                r.xack(STREAM, GROUP, msg_id)

if __name__ == "__main__":
    main()
```

*(Illustrative — add retry/error handling, structured logging, and metrics before production use.)*

---

## 6. Kubernetes Manifests

### 6.1 Redis (queue)

```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: redis
spec:
  serviceName: redis
  replicas: 1
  selector:
    matchLabels: { app: redis }
  template:
    metadata:
      labels: { app: redis }
    spec:
      containers:
        - name: redis
          image: redis:7.2-alpine
          args: ["--appendonly", "yes"]
          ports: [{ containerPort: 6379 }]
          volumeMounts:
            - name: redis-data
              mountPath: /data
  volumeClaimTemplates:
    - metadata: { name: redis-data }
      spec:
        accessModes: ["ReadWriteOnce"]
        resources: { requests: { storage: 5Gi } }
```

### 6.2 Vosk worker Deployment + KEDA autoscaler

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: vosk-worker
spec:
  replicas: 1
  selector:
    matchLabels: { app: vosk-worker }
  template:
    metadata:
      labels: { app: vosk-worker }
    spec:
      containers:
        - name: vosk-worker
          image: your-registry/vosk-worker:latest
          resources:
            requests: { cpu: "500m", memory: "512Mi" }
            limits:   { cpu: "1",    memory: "1Gi" }
          env:
            - name: REDIS_HOST
              value: redis
            - name: S3_ENDPOINT
              valueFrom:
                secretKeyRef: { name: storage-creds, key: endpoint }
---
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: vosk-worker-scaler
spec:
  scaleTargetRef:
    name: vosk-worker
  minReplicaCount: 0
  maxReplicaCount: 15
  cooldownPeriod: 120
  triggers:
    - type: redis-streams
      metadata:
        address: redis.default.svc.cluster.local:6379
        stream: asr-jobs
        consumerGroup: asr-workers
        pendingEntriesCount: "5"
```

### 6.3 Consensus scoring service

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: consensus-scorer
spec:
  replicas: 1
  selector:
    matchLabels: { app: consensus-scorer }
  template:
    metadata:
      labels: { app: consensus-scorer }
    spec:
      containers:
        - name: consensus-scorer
          image: your-registry/consensus-scorer:latest
          resources:
            requests: { cpu: "250m", memory: "256Mi" }
            limits:   { cpu: "500m", memory: "512Mi" }
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: consensus-scorer-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: consensus-scorer
  minReplicas: 1
  maxReplicas: 5
  metrics:
    - type: Resource
      resource:
        name: cpu
        target: { type: Utilization, averageUtilization: 70 }
```

### 6.4 Model storage PVC

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: asr-model-repo-pvc
spec:
  accessModes: ["ReadOnlyMany"]
  resources:
    requests: { storage: 5Gi }
  storageClassName: standard
```

### 6.5 Settlement batch job

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: score-settlement
spec:
  schedule: "0 */12 * * *"     # every 12 hours
  jobTemplate:
    spec:
      template:
        spec:
          restartPolicy: OnFailure
          containers:
            - name: settlement
              image: your-registry/settlement-job:latest
              resources:
                requests: { cpu: "250m", memory: "256Mi" }
```

---

## 7. Consensus Scoring Logic (Design Notes)

Since a single "gold standard" pronunciation doesn't exist for a dialect, scoring is relative:

1. Group all transcripts for a given `(prompt_id, dialect_tag)` once a minimum quorum (e.g., 5+ submissions) has accumulated.
2. Normalize each transcript (lowercase, strip punctuation).
3. Compute pairwise similarity (Levenshtein/word-error-rate, or embedding cosine similarity for a more robust signal) across the cluster.
4. A submission's score = its average similarity to the cluster consensus, adjusted by the Vosk word-confidence values.
5. Flag statistical outliers for human QA sampling rather than auto-rejecting (protects against penalizing genuine dialect variation vs. actual bad-faith submissions).

**Vosk-specific caveat:** since Vosk's language coverage is limited, cross-dialect comparison is only meaningful if the *same* base model is used consistently across a dialect cluster — don't mix models mid-comparison, or the consensus signal breaks.

---

## 8. Upgrade Path Beyond MVP (Reference — Not This Phase)

| Trigger | Action |
|---|---|
| Pilot proves the product loop (Phase 0 exit) | Introduce Whisper/faster-whisper as a CPU or small-GPU option for languages Vosk covers poorly |
| Enough verified dialect-tagged audio accumulated per dialect | Begin fine-tuning Wav2Vec2-XLSR-53 or MMS per dialect cluster (requires GPU node pool, `Job`/training pipeline — see prior discussion) |
| Fine-tuned models available | Swap the ASR worker's model backend behind the same queue interface — architecture doesn't need to change, only the worker image/model artifact |

This is why the design keeps ASR transcription, pre-filtering, and consensus scoring as **separate services**: Vosk can be replaced without touching the queue, database, or scoring logic.

---

## 9. Storage Summary (Recap)

| Data | Store | MVP size estimate |
|---|---|---|
| Raw audio | S3/MinIO | Single-digit GB at pilot scale |
| Vosk model | PVC (ReadOnlyMany) | ~50MB–1.8GB depending on model variant |
| Scores/ledger/metadata | Postgres | <1GB at pilot scale |
| Queue state | Redis (AOF) | <1GB |

No GPU node pool, no NVIDIA device plugin, no model-serving framework (Triton) needed for this phase — all components run on standard CPU nodes.

---

## 10. Open Questions / Decisions Needed Before Build

1. Which specific dialects are in the Phase 0 pilot, and does a matching (or closest-available) Vosk model exist for each?
2. Minimum quorum size for consensus scoring — how many submissions per prompt before a score can be computed?
3. What happens to a trainer's stake if their prompt never reaches quorum within the settlement window (refund vs. carry-over)?
4. Object storage choice: managed (S3/GCS) vs. self-hosted MinIO — affects the storage-creds secret and lifecycle-policy setup in §9.
5. Human QA sampling rate and workflow for flagged outliers.

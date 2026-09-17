# Dialect Library GCP ASR GPU Training — Final Plan

**Version:** 1.0  
**Starting budget:** $300 Google Cloud credit  
**Objective:** Train exportable language and dialect ASR models on temporary Google Cloud GPUs, preserve checkpoints and evaluations, publish approved models to Hugging Face, and stop GPU billing when each job ends.

## 1. Final Architecture

Dialect Library will use:

- **Cloud Storage:** versioned audio, manifests, checkpoints, metrics and release artifacts.
- **Vertex AI Custom Training:** temporary GPU jobs that terminate after training.
- **Artifact Registry:** versioned training containers.
- **Secret Manager:** Hugging Face token and other training secrets.
- **Hugging Face Transformers/PyTorch:** model fine-tuning.
- **Hugging Face Hub:** private review followed by approved public releases.
- **Vosk:** comparison baseline only, not the source of ground-truth transcripts.
- **CPU deployment:** for approved models where latency and throughput remain acceptable.

Google Speech-to-Text will not be used to build the exportable model because its managed model weights cannot be pushed to Hugging Face.

## 2. Temporary GPU Lifecycle

Each training run will:

1. Provision one temporary GPU worker.
2. Load the versioned training container and base model.
3. Read a frozen dataset version from Cloud Storage.
4. Train and validate the candidate model.
5. Upload checkpoints throughout training.
6. Save the best model, processor and metrics.
7. Terminate the GPU worker automatically when the job ends.
8. Publish the reviewed model to a private Hugging Face repository.

No permanent GPU VM, notebook or inference endpoint will be maintained during the initial phase.

## 3. Model Hierarchy

Do not train one final model containing every dialect immediately. Use:

```text
Multilingual pretrained foundation
├── Igbo language baseline
│   ├── Nsukka specialization
│   ├── Ezeagu specialization
│   └── Other Igbo specializations
├── Amharic language baseline
│   └── Regional specializations
├── Yoruba language baseline
└── Other language baselines
```

Language baselines learn shared patterns. Dialect adapters or continued fine-tuning preserve dialect-specific pronunciation, vocabulary and spelling.

## 4. Initial Model Decision

| Setting                 | First run                                            |
| ----------------------- | ---------------------------------------------------- |
| Base model              | `openai/whisper-small`                               |
| Target                  | One Igbo baseline or one well-prepared pilot dialect |
| Dataset                 | 10–25 validated hours                                |
| GPU                     | One NVIDIA T4                                        |
| Machine                 | `n1-standard-8`                                      |
| Precision               | FP16                                                 |
| Metrics                 | WER and CER                                          |
| Hugging Face visibility | Private until reviewed                               |

After the pipeline works, train MMS or XLS-R 300M on the same dataset and compare them on the same frozen test set. Select the production model from measured quality and operating cost.

## 5. Dataset Requirements

Every accepted item must contain:

- audio file;
- actual human-verified spoken transcript;
- normalized transcript;
- language, dialect and subdialect codes;
- anonymous speaker ID;
- duration;
- validation/consensus score;
- dataset split;
- consent and permitted-use status;
- optional English meaning stored separately.

An English prompt must never replace the transcript of the dialect words actually spoken.

Example JSONL record:

```json
{
  "audio": "gs://BUCKET/datasets/igbo/v1/audio/000001.wav",
  "text": "verified spoken transcript",
  "translation_en": "English meaning",
  "language": "ibo",
  "dialect": "nsukka",
  "dialect_code": "DL-IGB-NSK",
  "speaker_id": "speaker_001",
  "consensus_score": 0.96,
  "split": "train"
}
```

Vosk may produce a draft for review, but only the human-validated final transcript becomes ground truth.

## 6. Dataset Splitting and Balance

Use speaker-independent splitting:

- Training: 80%
- Validation: 10%
- Test: 10%

A speaker can appear in only one split. Never use the frozen test set to select hyperparameters.

Monitor balance across:

- dialect and subdialect;
- speaker region;
- age range and gender where consent permits;
- device type;
- quiet and noisy environments;
- sentence length;
- code-switching frequency.

## 7. GCP Setup

Create a dedicated project such as `dialect-library-asr` and enable:

- Vertex AI API;
- Cloud Storage API;
- Artifact Registry API;
- Cloud Build API;
- Secret Manager API;
- Cloud Logging API.

Create:

- one private Cloud Storage bucket;
- one Docker Artifact Registry repository;
- one least-privilege training service account;
- one fine-grained Hugging Face write-token secret;
- billing alerts at $50, $100, $200, $250 and $285.

Confirm regional T4 or L4 quota before launching a job. Quota approval does not guarantee immediate physical GPU capacity.

## 8. Storage Layout

```text
gs://BUCKET/
├── datasets/
│   └── igbo/
│       ├── v1/audio/
│       ├── v1/manifests/
│       └── v2/
├── checkpoints/
│   └── igbo/whisper-small/run-001/
├── evaluations/
│   └── igbo/whisper-small/run-001/
└── releases/
    └── igbo/whisper-small/v0.1/
```

Dataset versions must be immutable. Corrections create a new version.

## 9. Training Container

The pinned Docker image will contain:

- PyTorch with CUDA;
- Transformers;
- Datasets;
- Accelerate;
- Evaluate;
- JiWER;
- Librosa/SoundFile;
- Google Cloud Storage client;
- Hugging Face Hub client.

Every run records:

- image tag;
- base model and exact revision;
- dataset and normalization versions;
- hyperparameters and random seed;
- GPU type;
- training duration;
- approximate cost.

## 10. Required Training Behaviour

The application must:

1. validate manifests before GPU allocation where possible;
2. reject missing audio and empty transcripts;
3. resample audio to 16 kHz;
4. segment or reject recordings beyond the supported duration;
5. apply a versioned language-specific normalization policy;
6. enable FP16 and gradient checkpointing;
7. log training and validation loss;
8. calculate WER and CER;
9. checkpoint every 250–500 steps;
10. retain only the best two or three checkpoints;
11. upload checkpoints during training;
12. resume safely after interruption;
13. save the model and processor together;
14. test inference before declaring success.

## 11. Mandatory Smoke Test

The first GPU job runs only **20 steps** and has a hard timeout.

It passes only if:

- CUDA detects the GPU;
- Cloud Storage audio loads;
- audio and transcripts align;
- loss remains finite;
- validation completes;
- WER/CER are generated;
- a checkpoint is uploaded;
- the checkpoint reloads;
- one test recording is transcribed;
- no secret or contributor identity appears in logs.

Only then can the full training run begin.

## 12. Starting Full-Run Configuration

```yaml
machineType: n1-standard-8
acceleratorType: NVIDIA_TESLA_T4
acceleratorCount: 1
replicaCount: 1
precision: fp16
batchSizePerDevice: 4
gradientAccumulationSteps: 4
learningRate: 1.0e-5
gradientCheckpointing: true
saveSteps: 250
evalSteps: 250
saveTotalLimit: 2
```

These are starting values and should be adjusted from measured GPU memory and validation results.

Every job needs:

- a unique run ID;
- one replica initially;
- a hard runtime limit;
- versioned image and dataset references;
- checkpoint destination;
- automatic termination;
- immediate manual cancellation if logs show a broken run.

## 13. Evaluation and Promotion Gates

Measure:

- overall WER and CER;
- WER/CER per dialect;
- unseen-speaker performance;
- code-switching performance;
- quiet/noisy performance;
- device-specific performance;
- proper-name and number accuracy.

Compare every candidate against:

1. the untouched foundation model;
2. the current Vosk baseline;
3. the previous approved Dialect Library release.

Promote a candidate only when target performance improves without unacceptable regression for smaller dialect groups.

ASR must not decide the validation score for the data used to train it. Human consensus controls dataset acceptance; ASR evaluation measures the trained model afterward.

## 14. Hugging Face Release Process

Suggested repositories:

```text
dialect-library/whisper-small-igbo-v0.1
dialect-library/whisper-small-igbo-nsukka-v0.1
dialect-library/mms-igbo-v0.1
```

Release sequence:

1. Save the best artifacts to Cloud Storage.
2. Reload them in a clean environment.
3. Verify metrics and sample inference.
4. Prepare the model card.
5. Push to a private Hugging Face repository.
6. Complete independent quality, privacy and rights review.
7. Make the repository public only after approval.

The Hugging Face token must remain in Secret Manager or be provided only during a separate release job. It must never be committed to source code or embedded in a container.

## 15. Model Card Requirements

Each release documents:

- model name and version;
- base model and revision;
- supported languages and dialects;
- dataset version and validated hours;
- speaker count and distribution;
- normalization policy;
- training configuration and hardware;
- overall and dialect-level WER/CER;
- intended uses;
- limitations and known failures;
- consent and licensing basis;
- privacy statement;
- contact/reporting method.

Never publish contributor identities, private recordings, consent records or private Cloud Storage paths.

## 16. $300 Credit Allocation

| Activity                   |  Ceiling |
| -------------------------- | -------: |
| Storage and preparation    |      $15 |
| Builds and smoke tests     |      $25 |
| First Whisper baseline     |      $80 |
| Correction/repeat run      |      $60 |
| MMS/XLS-R comparison       |      $80 |
| Evaluation/failure reserve |      $40 |
| **Total**                  | **$300** |

Confirm live regional pricing before every full run.

Initially avoid:

- A100/H100 GPUs;
- distributed training;
- automatic hyperparameter sweeps;
- permanent GPU notebooks;
- permanent GPU inference endpoints.

## 17. Continuous Growth Strategy

Do not retrain after every submission. Trigger a candidate training run when:

- another 25–50 validated hours are ready;
- a new dialect reaches its minimum threshold;
- speaker/geographic coverage materially improves;
- normalization rules change;
- a scheduled quarterly release is due.

| Validated audio | Interpretation                                  |
| --------------: | ----------------------------------------------- |
|       1–3 hours | Pipeline test                                   |
|     10–25 hours | Experimental baseline                           |
|    50–100 hours | Useful early model                              |
|   200–500 hours | Strong production-oriented dialect model        |
|    1,000+ hours | Mature language baseline if coverage is diverse |

## 18. Implementation Phases

### Phase 1 — Infrastructure

- [ ] Create the dedicated GCP project.
- [ ] Configure budget alerts.
- [ ] Enable the required APIs.
- [ ] Create Cloud Storage and Artifact Registry.
- [ ] Create the least-privilege service account.
- [ ] Confirm T4/L4 quota.
- [ ] Create the private Hugging Face repository and scoped token.

### Phase 2 — Dataset Pilot

- [ ] Select one language/dialect pilot.
- [ ] Prepare 10–25 validated hours.
- [ ] Freeze speaker-independent splits.
- [ ] Generate JSONL manifests.
- [ ] Run audio/transcript quality checks.
- [ ] Upload an immutable dataset version.

### Phase 3 — Training Pipeline

- [ ] Implement training and evaluation scripts.
- [ ] Build and version the CUDA container.
- [ ] Verify checkpoint uploads.
- [ ] Run the 20-step T4 smoke test.
- [ ] Test checkpoint reload and inference.

### Phase 4 — First Baseline

- [ ] Submit the time-limited full Vertex job.
- [ ] Monitor initial logs and cost.
- [ ] Evaluate the frozen test set.
- [ ] Compare Whisper, untouched baseline and Vosk.
- [ ] Document results and limitations.

### Phase 5 — Release

- [ ] Store approved release artifacts.
- [ ] Write the model card.
- [ ] Push privately to Hugging Face.
- [ ] Run independent acceptance testing.
- [ ] Publish only after quality and rights approval.

### Phase 6 — Expansion

- [ ] Compare MMS/XLS-R.
- [ ] Select the strongest base per language family.
- [ ] Train dialect adapters or specializations.
- [ ] Establish scheduled retraining and promotion.
- [ ] Optimize approved models for CPU inference.

## 19. Definition of Success

The first milestone is complete when Dialect Library can repeatedly:

1. select a versioned validated dataset;
2. launch a temporary GPU job;
3. train and checkpoint without permanent server management;
4. terminate GPU billing when training ends;
5. produce reproducible WER/CER results;
6. reload the model in a clean environment;
7. push an approved private release to Hugging Face;
8. compare it against Vosk and the previous baseline.

## 20. Final Operating Rule

**Audio and human-validated transcripts create the training truth. Human consensus controls dataset acceptance. Temporary GPUs train candidate models. Frozen test sets measure them. Only reviewed improvements become Hugging Face releases.**

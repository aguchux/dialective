# WAXAL Integration Plan

## Goal

Add **WAXAL** to Dialect Library as an external African-language speech dataset that can be used for:

- ASR benchmarking
- language coverage evaluation
- future offline model training/fine-tuning
- comparison against Dialect Library contributor recordings

WAXAL must **not replace the existing production ASR pipeline** initially.

The current project remains CPU-first, with Vosk/Whisper workers and Redis Streams unchanged. The existing `AGENTS.md` also explicitly keeps fine-tuning/training outside the current production phase, so WAXAL integration should begin as an offline dataset and evaluation subsystem.

---

## Phase 1 — Add WAXAL Dataset Support

Create:

```text
datasets/
└── waxal/
    ├── README.md
    ├── manifest.example.json
    └── scripts/
        ├── download.py
        ├── prepare.py
        └── validate.py
```

Do **not commit WAXAL audio files** to Git.

The scripts should:

1. Download selected WAXAL language datasets.
2. Store them outside the repository or in configurable object storage.
3. Generate a normalized local manifest.
4. Validate audio files and transcripts.
5. Report unavailable or malformed samples.

---

## Phase 2 — Create a Common Speech Dataset Format

Normalize WAXAL into a simple internal structure:

```json
{
  "dataset": "waxal",
  "language": "yoruba",
  "languageTag": "yo",
  "dialectTag": null,
  "audioPath": "...",
  "transcript": "...",
  "durationSeconds": 4.8,
  "speakerId": "...",
  "split": "test"
}
```

Do not invent dialect tags where WAXAL only identifies a language.

Dialect Library dialect-level data must remain distinct from WAXAL language-level data.

---

## Phase 3 — Add WAXAL Language Registry

Create:

```text
models/waxal-registry.yaml
```

Example:

```yaml
yo:
  name: Yoruba
  dataset: waxal
  enabled: true

ha:
  name: Hausa
  dataset: waxal
  enabled: true

ig:
  name: Igbo
  dataset: waxal
  enabled: true
```

Only add languages confirmed to exist in the actual WAXAL release being used.

Do not hardcode WAXAL language mappings inside Python workers.

---

## Phase 4 — Build an Offline ASR Benchmark

Create:

```text
tools/asr-benchmark/
```

The benchmark tool should be able to run WAXAL audio through the ASR engines already supported by Dialect Library.

Initial comparison:

```text
WAXAL audio
    │
    ├── Vosk
    │
    └── Whisper
         │
         ▼
    Predicted Transcript
         │
         ▼
 Compare with WAXAL transcript
```

Calculate:

- Word Error Rate — WER
- Character Error Rate — CER
- successful transcription count
- failed transcription count
- average processing time
- results per language

Example output:

```text
Language: Yoruba

Samples: 1,000

Whisper
WER: 18.4%
CER: 8.1%

Vosk
Unsupported
```

Benchmarking must remain **offline** and must not enter the live contributor scoring path.

---

## Phase 5 — Produce Benchmark Reports

Write results to:

```text
reports/waxal/
```

Example:

```text
reports/waxal/
├── yoruba.json
├── hausa.json
├── igbo.json
└── summary.md
```

The summary should clearly show which ASR engine performs best for each supported language.

---

## Phase 6 — Compare WAXAL With Dialect Library Data

Later, once enough validated Dialect Library recordings exist, extend the benchmark to compare:

```text
WAXAL
    +
Dialect Library validated recordings
```

Evaluation should show:

```text
Language-level performance
        vs
Dialect-level performance
```

Example:

```text
Igbo — WAXAL
WER: 15%

Igbo — Dialect Library Nsukka cluster
WER: 27%

Igbo — Dialect Library Owerri cluster
WER: 22%
```

This will help identify where generic language models perform poorly on real dialect variation.

---

## Phase 7 — Prepare for Future Model Training

Do **not add production model training yet**.

Instead create a future-ready directory:

```text
training/
└── README.md
```

Document the planned future flow:

```text
WAXAL
   +
Validated Dialect Library recordings
        │
        ▼
Offline ASR training/fine-tuning
        │
        ▼
Evaluate
        │
        ▼
Optimize / quantize
        │
        ▼
CPU inference model
        │
        ▼
Register in asr-registry.yaml
```

Any actual training or fine-tuning requires a separate explicit project decision because the current repository rules exclude model training from the MVP phase.

---

## Phase 8 — Keep Production ASR Unchanged

Do not modify the current submission flow:

```text
Contributor
    ↓
API
    ↓
asr-registry.yaml
    ↓
Vosk or Whisper
    ↓
Consensus
    ↓
Scoring
```

WAXAL should initially operate beside this system:

```text
                    ┌── Production ASR
Contributor ────────┤
                    │
                    └── Existing pipeline


WAXAL ──────────────► Offline Benchmark
```

There must be **no runtime dependency on the WAXAL dataset**.

---

## Agent Guardrails

The coding agent must:

- keep WAXAL audio outside Git;
- preserve the current Vosk/Whisper workers;
- preserve Redis Streams;
- keep production inference CPU-only;
- not introduce CUDA or GPU Kubernetes resources;
- not add a training service to Kubernetes;
- not silently assign dialect labels to WAXAL data;
- verify the dataset's exact license and attribution requirements before downloading or redistributing it;
- keep WAXAL dataset configuration separate from `models/asr-registry.yaml`;
- update `AGENTS.md` when the WAXAL subsystem is added.

---

## MVP Deliverable

The first implementation is complete when this works:

```bash
python datasets/waxal/scripts/download.py --language yo

python datasets/waxal/scripts/prepare.py --language yo

python tools/asr-benchmark/benchmark.py \
  --dataset waxal \
  --language yo \
  --engine whisper
```

and produces:

```text
reports/waxal/yoruba.json
reports/waxal/summary.md
```

### First Target

Start with **one language only**.

Recommended:

```text
Yoruba
```

Once the complete download → normalization → ASR → WER/CER → report workflow works correctly, extend it to Hausa, Igbo, and the other WAXAL languages.

**Implementation principle:**

> WAXAL provides the African-language benchmark and foundation.  
> Dialect Library provides the dialect-specific community data.
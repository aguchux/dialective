# Dialect Library Speech Expression Metadata Plan

## 1. Goal

Extend every validated Dialect Library recording so that, in addition to:

```text
Audio
Transcript
English meaning
Dialect ID
Speaker
Quality score
Validation
```

the platform can optionally store:

```text
Emotion
Tone
Speaking style
Speed
Pitch
Energy
Volume
Dynamics
Phonemes
Phoneme timing
Visemes
Viseme timing
Word timing
Sentence timing
```

The purpose is to make the same dataset useful in the future for:

```text
ASR
TTS
Expressive TTS
Emotion-aware AI
Pronunciation analysis
Lip synchronization
Talking avatars
ChatDialect / Dialect Talk
Speech research
```

The implementation should be incremental. **Do not require all metadata before a recording can enter the dataset.**

---

## 2. Core Principle

Treat the original recording as the permanent source of truth.

```text
Recording
   │
   ├── Audio
   ├── Transcript
   └── Dialect
         │
         ├── Prosody
         ├── Emotion
         ├── Timing
         ├── Phonemes
         └── Visemes
```

Derived metadata can always be regenerated later with better models.

> Never permanently bake phonemes, emotions, visemes, or timing directly into the core recording record.

Keep them as **versioned annotations**.

---

## 3. Core Recording Model

Keep the main recording object relatively simple:

```json
{
  "id": "rec_123",
  "dialectId": "DL-IGB-NSK",
  "audioUrl": "s3://...",
  "transcript": "Ụtụtụ ọma",
  "englishMeaning": "Good morning",
  "durationMs": 1250,
  "validationStatus": "VALIDATED",
  "qualityScore": 94
}
```

Everything else should attach to this recording through annotation records.

---

## 4. Add a Speech Annotation Layer

Recommended concept:

```text
recording
    ↓
speech_annotation
```

Example:

```json
{
  "recordingId": "rec_123",
  "annotationVersion": 1,
  "prosody": {},
  "emotion": {},
  "timing": {},
  "phonemes": [],
  "visemes": []
}
```

This means you can update the analysis later without changing the original recording.

---

## 5. Prosody Schema

Start with:

```json
{
  "prosody": {
    "emotion": "happy",
    "tone": "friendly",
    "style": "conversational",
    "speed": "normal",
    "pitch": "medium",
    "energy": "medium",
    "volume": "normal",
    "dynamics": "natural"
  }
}
```

Use controlled values initially.

### Emotion

```text
neutral
happy
sad
angry
excited
surprised
calm
fearful
```

### Tone

```text
neutral
warm
friendly
serious
formal
playful
authoritative
gentle
```

### Style

```text
conversational
narration
question
command
announcement
storytelling
reading
```

### Speed

```text
very_slow
slow
normal
fast
very_fast
```

### Pitch

```text
low
medium
high
```

### Energy

```text
low
medium
high
```

### Dynamics

```text
flat
natural
expressive
```

These values should eventually be configurable from the database rather than permanently hard-coded.

---

## 6. Store Machine Measurements Separately

Do not rely only on labels such as `fast`, `high`, or `loud`. Also store numerical measurements where available.

```json
{
  "acousticFeatures": {
    "speechRateWpm": 132.4,
    "meanPitchHz": 147.8,
    "pitchMinHz": 92.3,
    "pitchMaxHz": 231.6,
    "meanEnergyDb": -17.4,
    "peakEnergyDb": -4.8
  }
}
```

This makes the dataset more useful for future model training and analysis.

---

## 7. Emotion Annotations Should Support Confidence

Emotion is not always absolute.

```json
{
  "emotion": {
    "primary": "happy",
    "confidence": 0.87,
    "source": "model"
  }
}
```

Later, support multiple scores:

```json
{
  "emotion": {
    "labels": [
      { "name": "happy", "score": 0.73 },
      { "name": "excited", "score": 0.21 }
    ]
  }
}
```

---

## 8. Human vs Automated Annotation

Every annotation should identify where it came from.

```json
{
  "source": "MODEL",
  "model": "dl-emotion-v1",
  "confidence": 0.91
}
```

Supported sources:

```text
CONTRIBUTOR
VALIDATOR
EXPERT
MODEL
DERIVED
```

This allows Dialect Library to preserve disagreement and annotation history.

---

## 9. Word Timing

Implement **word-level timing** before phoneme and viseme timing.

```json
{
  "words": [
    { "text": "Ụtụtụ", "startMs": 0, "endMs": 520 },
    { "text": "ọma", "startMs": 540, "endMs": 960 }
  ]
}
```

This supports subtitle synchronization, ASR alignment, pronunciation scoring, phoneme alignment, viseme animation, and conversation playback.

---

## 10. Phoneme Representation

Later add phoneme segmentation.

```json
{
  "phonemes": [
    { "symbol": "u", "alphabet": "IPA", "startMs": 0, "endMs": 110 },
    { "symbol": "t", "alphabet": "IPA", "startMs": 110, "endMs": 180 }
  ]
}
```

Recommended default:

```text
IPA — International Phonetic Alphabet
```

But support other representations:

```text
IPA
ARPABET
CUSTOM
MODEL_NATIVE
```

---

## 11. Dialect-Specific Phonemes

Do not assume the parent language's phoneme inventory is sufficient for every subdialect.

```json
{
  "phoneme": "X",
  "languageId": "DL-IGB",
  "dialectId": "DL-IGB-NSK",
  "representation": "IPA"
}
```

This allows language-level and subdialect-specific sound patterns to coexist.

---

## 12. Viseme Model

A viseme represents the visible mouth position associated with speech sounds.

```json
{
  "visemes": [
    { "id": "DL_V01", "startMs": 0, "endMs": 120 },
    { "id": "DL_V04", "startMs": 120, "endMs": 230 }
  ]
}
```

Use a mapping layer:

```text
phoneme
   ↓
viseme mapping
   ↓
animation target
```

---

## 13. Keep Visemes Independent of Animation Engines

Do not design the dataset around one avatar technology.

```text
Dialect Library Viseme
          ↓
       Adapter
          ↓
 ┌────────┼─────────┐
 ▼        ▼         ▼
WebGL   MetaHuman  Custom Avatar
```

A generic value such as `DL_V03` can later map to ARKit, MetaHuman, Three.js morph targets, or another animation system.

---

## 14. Viseme Mapping Table

Create a mapping table or registry.

```json
{
  "mappingId": "dl-viseme-v1",
  "phonemes": ["p", "b", "m"],
  "viseme": "DL_V01"
}
```

Future mappings may include:

```text
DL Viseme Standard v1
ARKit mapping
MetaHuman mapping
WebAvatar mapping
```

---

## 15. Timing Standard

Standardize internal timing on **milliseconds**.

```json
{
  "startMs": 1240,
  "endMs": 1410
}
```

Avoid mixing seconds, frames, audio samples, and timestamps inside core storage. Convert to frames only at playback or animation time.

---

## 16. Support Hierarchical Timing

The long-term hierarchy should support:

```text
Recording
   │
   ├── Sentence
   │      ├── Word
   │      │     ├── Phoneme
   │      │     │      └── Viseme
```

---

## 17. Database Structure

Recommended PostgreSQL structure:

```text
recordings
speech_annotations
word_alignments
phoneme_alignments
viseme_alignments
prosody_annotations
emotion_annotations
annotation_models
```

Relationship:

```text
recordings
   |
   +── speech_annotations
          |
          +── word_alignments
          +── phoneme_alignments
          +── viseme_alignments
          +── emotion_annotations
          +── prosody_annotations
```

Do not put extremely large alignment arrays directly inside the main `recordings` record.

---

## 18. JSONB Usage

JSONB remains useful for less-frequently queried metadata.

```json
{
  "prosody": {
    "emotion": "happy",
    "tone": "warm",
    "style": "conversation"
  }
}
```

Frequently queried fields should remain proper indexed columns, such as:

```text
dialect_id
emotion
validation_status
model_version
```

---

## 19. Model Versioning

Every automated annotation must record which model generated it.

```json
{
  "model": {
    "name": "dl-phoneme-aligner",
    "version": "1.3.0"
  }
}
```

This allows improved annotation versions without destroying historical results.

---

## 20. Annotation Status

Recommended statuses:

```text
PENDING
GENERATED
REVIEW_REQUIRED
VALIDATED
SUPERSEDED
REJECTED
```

The same mechanism can apply to emotion, phoneme, prosody, and viseme annotations.

---

## 21. Automate Most Annotation

Do not manually label every phoneme, viseme, emotion, and timing point.

```text
Audio
   ↓
Automated analysis
   ↓
Emotion
Prosody
Word alignment
Phonemes
Visemes
   ↓
Confidence scoring
   ↓
Human review only where necessary
```

Human review should focus on low-confidence results, research samples, benchmark datasets, high-value dialects, and model validation.

---

## 22. Recording Processing Pipeline

```text
Contributor records
       ↓
Audio stored
       ↓
ASR
       ↓
Transcript
       ↓
Forced alignment
       ↓
Word timing
       ↓
Phoneme alignment
       ↓
Viseme mapping
       ↓
Prosody analysis
       ↓
Emotion analysis
       ↓
Quality analysis
       ↓
Validation
       ↓
Training-approved dataset
```

---

## 23. Keep Production Processing Asynchronous

Do not force contributors to wait while all enrichment processing completes.

User-facing flow:

```text
Recording uploaded ✓
```

Background workers:

```text
ASR
alignment
prosody
emotion
phoneme
viseme
```

Example Redis Stream architecture:

```text
Upload
  ↓
Redis Stream

speech.asr
speech.align
speech.prosody
speech.emotion
speech.viseme
```

Each worker should be independently deployable and retryable.

---

## 24. Future ChatDialect / Dialect Talk Pipeline

```text
User speaks Nsukka Igbo
       ↓
DL-IGB-NSK ASR
       ↓
Transcript
       ↓
Conversation AI
       ↓
Nsukka response
       ↓
DL-IGB-NSK TTS
       ↓
Phoneme timing
       ↓
Viseme timing
       ↓
Emotion + prosody
       ↓
Animated face
       ↓
AI speaks naturally
```

The speaking face can then move lips, smile, raise eyebrows, change expression, change speaking energy, and synchronize mouth movement.

---

## 25. Separate Linguistic Data From Presentation Data

Keep speech meaning/expression separate from avatar animation instructions.

```text
Emotion = happy
```

is speech-expression metadata.

Whereas:

```text
raise-left-eyebrow = 0.73
```

is animation metadata.

Use:

```text
Speech data
      ↓
Expression interpreter
      ↓
Avatar animation
```

This lets one dataset drive many avatar implementations.

---

## 26. Future Dataset Record

```json
{
  "recordingId": "rec_84722",
  "dialectId": "DL-IGB-NSK",
  "audio": {
    "url": "s3://...",
    "durationMs": 2410
  },
  "text": {
    "transcript": "Ụtụtụ ọma",
    "englishMeaning": "Good morning"
  },
  "prosody": {
    "emotion": "happy",
    "tone": "friendly",
    "style": "conversational",
    "speed": "normal",
    "pitch": "medium",
    "energy": "medium",
    "dynamics": "expressive"
  },
  "acoustics": {
    "speechRateWpm": 127,
    "meanPitchHz": 164.3
  },
  "words": [],
  "phonemes": [],
  "visemes": [],
  "quality": {
    "score": 94
  },
  "annotation": {
    "version": 3,
    "status": "VALIDATED"
  }
}
```

---

## 27. Implementation Phases

### Phase 1 — Now

Add:

```text
emotion
tone
style
speed
pitch
energy
volume
dynamics
```

Also add annotation versioning. No phoneme or viseme generation is required yet.

### Phase 2

Add:

```text
word timing
sentence timing
basic acoustic measurements
```

### Phase 3

Add:

```text
phoneme inventory
phoneme alignment
dialect-specific phoneme support
```

### Phase 4

Add:

```text
viseme mappings
viseme timing
avatar adapters
ChatDialect facial animation
```

---

## 28. Extensible Future Features

Add an extensible feature area:

```json
{
  "features": {}
}
```

Potential future metadata:

```text
accent strength
voice age class
breathiness
intonation contour
stress
rhythm
syllable timing
speaker embedding
audio embedding
linguistic embedding
code switching
language confidence
dialect confidence
```

---

# Final Architecture

```text
DIALECT RECORDING
      │
      ├── Identity
      │     Country
      │     Language
      │     Dialect
      │     Subdialect
      │
      ├── Audio
      │
      ├── Transcript
      │
      ├── Translation
      │
      ├── Prosody
      │     Emotion
      │     Tone
      │     Speed
      │     Pitch
      │     Energy
      │     Dynamics
      │
      ├── Alignment
      │     Sentence
      │     Word
      │     Phoneme
      │     Viseme
      │
      ├── Quality
      │
      ├── Validation
      │
      └── Annotation Versions
```

## Core Engineering Rule

**Store raw recordings permanently, keep all derived speech intelligence as versioned annotations, and never tie phonemes or visemes to one specific model or avatar technology.**

This gives Dialect Library a future-proof dataset architecture that can evolve from today's ASR work into:

```text
ASR
+
Expressive TTS
+
Emotion-aware conversation
+
Synchronized talking faces
```

without requiring a full redesign of the data platform.

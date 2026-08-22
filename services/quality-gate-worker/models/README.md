# liveness_classifier.joblib

Trained offline against a public anti-spoofing corpus (e.g. ASVspoof
2019/2021 LA — real vs TTS/voice-conversion/replay attacks), not in this
repo's CI. `liveness.py::extract_features` documents the exact feature
pipeline (MFCC + delta + delta-delta, mean+std pooled) the classifier
must be trained on — any retrain must use the same pipeline or the
shipped artifact and `extract_features` will silently disagree on feature
shape.

Expected artifact: a scikit-learn-compatible classifier (e.g.
`LogisticRegression` or `HistGradientBoostingClassifier`) exposing
`predict_proba`, where **class index 1 is "live human speech"** and class
index 0 is "spoofed" (TTS/replay/synthetic). `liveness.py::
compute_liveness_score` reads `predict_proba(...)[0][1]` directly.

## Placeholder model

`train_placeholder.py` in this directory generates a trivial stand-in
model (trained on synthetic sine-wave-vs-noise-burst examples, not real
speech) purely so the pipeline has *a* model to load end-to-end before a
real ASVspoof-trained artifact is produced. **Do not treat its output
scores as meaningful anti-spoofing accuracy** — it exists only to keep
`services/quality-gate-worker` runnable and testable. Replace
`liveness_classifier.joblib` with a real trained artifact (and update
this note with the training run's EER/accuracy metrics on a held-out
split) before `PlatformSettings.qualityGateEnabled` is ever turned on in
production, per the plan's phased rollout (Phase 0 ships with the gate
disabled specifically to allow this to happen without blocking the rest
of the pipeline).

**Regenerated 2026-08-18**: the committed artifact had been pickled
against an older scikit-learn than the `scikit-learn==1.5.1` pinned in
`requirements.txt`, so every `predict_proba` call in production crashed
with `AttributeError: 'LogisticRegression' object has no attribute
'multi_class'` — meaning noise/quality/liveness scores were never
successfully written for any WordRecording or Submission row. Re-ran
`train_placeholder.py` against the exact deployed image's Python/sklearn
environment to produce a fresh, load-compatible placeholder. If this
happens again after a `scikit-learn` version bump in `requirements.txt`,
re-run this script the same way (inside a pod built from the updated
image, not a local environment) rather than assuming the pinned version
alone guarantees pickle compatibility.

# emotion_classifier.joblib

Trained offline against a public speech-emotion corpus (e.g. RAVDESS or
CREMA-D — both English-heavy, not dialect-specific, so cross-dialect
emotion accuracy is an explicit known limitation, not yet addressed).
`expression.py::extract_emotion_features` documents the exact feature
pipeline (MFCC + delta + delta-delta, mean+std pooled — same pipeline
shape as `liveness.py::extract_features`, duplicated rather than shared)
the classifier must be trained on.

Expected artifact: a scikit-learn-compatible classifier exposing
`predict_proba`, where the column order matches `expression.py::
EMOTION_LABELS` exactly (`NEUTRAL, HAPPY, SAD, ANGRY, FEARFUL, SURPRISED,
DISGUSTED`), which in turn must match Prisma's `SpeechEmotion` enum values
exactly — a training-label/enum mismatch surfaces as a loud Postgres
enum-validation error on write (`db.py::write_expression`), not a silent
bad write. `expression.py::compute_emotion` reads `predict_proba(...)[0]`,
argmaxes it for the label, and uses the max probability as confidence.

## Placeholder model

`train_emotion_placeholder.py` in this directory generates a trivial
stand-in model (trained on synthetic per-label tone variations, not real
emotional speech) purely so the pipeline has *a* model to load end-to-end
before a real RAVDESS/CREMA-D-trained artifact is produced. **Do not treat
its output scores as meaningful emotion-classification accuracy** — it
exists only to keep `services/quality-gate-worker` runnable and testable
with `PlatformSettings.speechExpressionEnabled` on. Replace
`emotion_classifier.joblib` with a real trained artifact (and update this
note with the training run's accuracy/F1 metrics on a held-out split)
before `speechExpressionEnabled` is ever turned on in production.

If a future `scikit-learn` version bump breaks pickle-compatibility for
this artifact the same way it did for `liveness_classifier.joblib` above,
re-run `train_emotion_placeholder.py` inside a pod built from the updated
image, not a local environment.

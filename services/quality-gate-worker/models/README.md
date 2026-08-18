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

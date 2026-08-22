"""
Generates a placeholder emotion_classifier.joblib so the pipeline has a
loadable model end-to-end before a real RAVDESS/CREMA-D-trained artifact
exists. See README.md in this directory -- this is NOT a real emotion
classifier, its scores carry no real accuracy guarantee. Run from this
directory:

    python train_emotion_placeholder.py
"""

import os
import sys

import joblib
import numpy as np
from sklearn.linear_model import LogisticRegression

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from expression import EMOTION_LABELS, SAMPLE_RATE, extract_emotion_features  # noqa: E402


def synthetic_clip_for_label(rng: np.random.Generator, label_index: int, duration_s: float = 2.0) -> np.ndarray:
    """
    A rough per-label synthetic tone, distinguished only by pitch/jitter/
    amplitude-modulation parameters -- purely so each of the 7 labels
    produces a distinguishable feature vector for a trivial placeholder
    classifier. Carries no relationship to how real emotional speech
    actually varies acoustically; see README.md.
    """
    t = np.linspace(0, duration_s, int(SAMPLE_RATE * duration_s), endpoint=False)
    base_pitch = 120 + label_index * 15
    jitter = rng.normal(0, 2 + label_index, size=t.shape).cumsum() * 0.01
    am_rate = 2 + label_index * 0.5
    signal = np.sin(2 * np.pi * np.cumsum(base_pitch + jitter) / SAMPLE_RATE)
    signal *= 0.6 + 0.4 * np.sin(2 * np.pi * am_rate * t)
    signal += rng.normal(0, 0.02, size=t.shape)
    return (signal / np.max(np.abs(signal))).astype(np.float32)


def main() -> None:
    rng = np.random.default_rng(42)
    features, labels = [], []
    for label_index, _label in enumerate(EMOTION_LABELS):
        for _ in range(60):
            features.append(extract_emotion_features(synthetic_clip_for_label(rng, label_index)))
            labels.append(label_index)

    clf = LogisticRegression(max_iter=1000)
    clf.fit(np.array(features), np.array(labels))

    out_path = os.path.join(os.path.dirname(__file__), "emotion_classifier.joblib")
    joblib.dump(clf, out_path)
    print(f"Wrote placeholder model to {out_path}")


if __name__ == "__main__":
    main()

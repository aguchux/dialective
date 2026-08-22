"""
Generates a placeholder liveness_classifier.joblib so the pipeline has a
loadable model end-to-end before a real ASVspoof-trained artifact exists.
See README.md in this directory -- this is NOT a real anti-spoofing model,
its scores carry no real accuracy guarantee. Run from this directory:

    python train_placeholder.py
"""

import os
import sys

import joblib
import numpy as np
from sklearn.linear_model import LogisticRegression

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from liveness import SAMPLE_RATE, extract_features  # noqa: E402


def synthetic_live_clip(
    rng: np.random.Generator, duration_s: float = 2.0
) -> np.ndarray:
    """A natural-ish voiced tone with breath noise and slight pitch jitter -- a rough stand-in for a real voice's spectral irregularity."""
    t = np.linspace(0, duration_s, int(SAMPLE_RATE * duration_s), endpoint=False)
    fundamental = 140 + rng.normal(0, 8, size=t.shape).cumsum() * 0.01
    signal = np.sin(2 * np.pi * np.cumsum(fundamental) / SAMPLE_RATE)
    signal += 0.3 * np.sin(2 * np.pi * np.cumsum(fundamental * 2) / SAMPLE_RATE)
    signal += rng.normal(0, 0.02, size=t.shape)
    return (signal / np.max(np.abs(signal))).astype(np.float32)


def synthetic_spoof_clip(
    rng: np.random.Generator, duration_s: float = 2.0
) -> np.ndarray:
    """A perfectly steady tone with no jitter/breath -- a rough stand-in for a flat, overly-clean TTS/replay artifact."""
    t = np.linspace(0, duration_s, int(SAMPLE_RATE * duration_s), endpoint=False)
    signal = np.sin(2 * np.pi * 140 * t) + 0.3 * np.sin(2 * np.pi * 280 * t)
    return (signal / np.max(np.abs(signal))).astype(np.float32)


def main() -> None:
    rng = np.random.default_rng(42)
    features, labels = [], []
    for _ in range(200):
        features.append(extract_features(synthetic_live_clip(rng)))
        labels.append(1)
        features.append(extract_features(synthetic_spoof_clip(rng)))
        labels.append(0)

    clf = LogisticRegression(max_iter=1000)
    clf.fit(np.array(features), np.array(labels))

    out_path = os.path.join(os.path.dirname(__file__), "liveness_classifier.joblib")
    joblib.dump(clf, out_path)
    print(f"Wrote placeholder model to {out_path}")


if __name__ == "__main__":
    main()

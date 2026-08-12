import numpy as np
import pytest

from liveness import compute_liveness_score, extract_features
from noise import SAMPLE_RATE


class FakeModel:
    """Mocks the loaded classifier so this test validates the extract-features -> predict -> score-mapping wiring, not real-world anti-spoofing accuracy (that's validated offline against a held-out corpus, see models/README.md)."""

    def __init__(self, proba_live: float):
        self.proba_live = proba_live

    def predict_proba(self, features):
        return np.array([[1 - self.proba_live, self.proba_live]])


def sine_wave(freq: float, duration_s: float, amplitude: float, sample_rate: int = SAMPLE_RATE) -> np.ndarray:
    t = np.linspace(0, duration_s, int(sample_rate * duration_s), endpoint=False)
    return amplitude * np.sin(2 * np.pi * freq * t)


def test_extract_features_returns_fixed_length_vector():
    data = sine_wave(180, 1.0, 0.5)
    features = extract_features(data)
    assert features.ndim == 1
    assert features.shape[0] > 0
    assert np.isfinite(features).all()


def test_compute_liveness_score_maps_high_confidence_to_high_score():
    data = sine_wave(180, 1.0, 0.5)
    score = compute_liveness_score(data, model=FakeModel(proba_live=0.92))
    assert score == pytest.approx(92.0, abs=0.5)


def test_compute_liveness_score_maps_low_confidence_to_low_score():
    data = sine_wave(180, 1.0, 0.5)
    score = compute_liveness_score(data, model=FakeModel(proba_live=0.05))
    assert score == pytest.approx(5.0, abs=0.5)


def test_compute_liveness_score_in_range():
    data = sine_wave(180, 1.0, 0.5)
    for proba in (0.0, 0.5, 1.0):
        score = compute_liveness_score(data, model=FakeModel(proba_live=proba))
        assert 0 <= score <= 100

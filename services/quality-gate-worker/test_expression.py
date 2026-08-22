import numpy as np
import pytest

from expression import (
    EMOTION_LABELS,
    bucket_energy,
    bucket_speed,
    compute_emotion,
    extract_prosody_metrics,
)
from noise import SAMPLE_RATE


class FakeEmotionModel:
    """Mocks the loaded classifier -- validates the extract-features -> predict -> label/confidence wiring, not real-world emotion-classification accuracy (that's evaluated offline against a held-out corpus, see models/README.md)."""

    def __init__(self, proba: list[float]):
        self.proba = proba

    def predict_proba(self, features):
        return np.array([self.proba])


def sine_wave(freq: float, duration_s: float, amplitude: float, sample_rate: int = SAMPLE_RATE) -> np.ndarray:
    t = np.linspace(0, duration_s, int(sample_rate * duration_s), endpoint=False)
    return amplitude * np.sin(2 * np.pi * freq * t)


def speech_like_segment(rng: np.random.Generator, duration_s: float, amplitude: float) -> np.ndarray:
    t = np.linspace(0, duration_s, int(SAMPLE_RATE * duration_s), endpoint=False)
    envelope = 0.6 + 0.4 * np.sin(2 * np.pi * 4 * t) ** 2
    harmonics = sum(np.sin(2 * np.pi * f * t) for f in (120, 240, 360, 480))
    voiced = amplitude * envelope * (harmonics / 4)
    breath_noise = rng.normal(0, amplitude * 0.05, t.shape)
    return (voiced + breath_noise).astype(np.float32)


def test_extract_prosody_metrics_returns_expected_keys_and_bounds():
    rng = np.random.default_rng(0)
    data = speech_like_segment(rng, 2.0, 0.8)

    metrics = extract_prosody_metrics(data)

    assert set(metrics.keys()) == {
        "speechRateEstimate",
        "meanPitchHz",
        "pitchStdHz",
        "meanRmsDb",
        "rmsStdDb",
        "pauseRatio",
    }
    # Human vocal fundamental frequency range is roughly 65-1000 Hz; a
    # sine-based synthetic speech-like signal should land well inside it.
    if metrics["meanPitchHz"] is not None:
        assert 50 <= metrics["meanPitchHz"] <= 1000
    if metrics["pauseRatio"] is not None:
        assert 0 <= metrics["pauseRatio"] <= 1


def test_extract_prosody_metrics_handles_silence_without_crashing():
    silence = np.zeros(SAMPLE_RATE * 1, dtype=np.float32)

    metrics = extract_prosody_metrics(silence)

    assert set(metrics.keys()) == {
        "speechRateEstimate",
        "meanPitchHz",
        "pitchStdHz",
        "meanRmsDb",
        "rmsStdDb",
        "pauseRatio",
    }


def test_bucket_speed_thresholds():
    assert bucket_speed(None) is None
    assert bucket_speed(1.0) == "SLOW"
    assert bucket_speed(3.5) == "NORMAL"
    assert bucket_speed(6.0) == "FAST"


def test_bucket_energy_thresholds():
    assert bucket_energy(None) is None
    assert bucket_energy(-40.0) == "LOW"
    assert bucket_energy(-20.0) == "MEDIUM"
    assert bucket_energy(-5.0) == "HIGH"


def test_compute_emotion_returns_argmax_label_and_confidence():
    data = sine_wave(180, 1.0, 0.5)
    # HAPPY is index 1 in EMOTION_LABELS
    proba = [0.05, 0.7, 0.05, 0.05, 0.05, 0.05, 0.05]

    label, confidence = compute_emotion(data, model=FakeEmotionModel(proba))

    assert label == "HAPPY"
    assert confidence == pytest.approx(0.7, abs=1e-6)


def test_compute_emotion_label_is_always_a_valid_enum_value():
    data = sine_wave(180, 1.0, 0.5)
    for index in range(len(EMOTION_LABELS)):
        proba = [0.0] * len(EMOTION_LABELS)
        proba[index] = 1.0
        label, _confidence = compute_emotion(data, model=FakeEmotionModel(proba))
        assert label == EMOTION_LABELS[index]
        assert label in EMOTION_LABELS


def test_emotion_labels_match_prisma_schema_enum_exactly():
    """
    Guards against EMOTION_LABELS silently drifting from Prisma's
    SpeechEmotion enum (services/api/prisma/schema.prisma) -- a mismatch
    would surface as a Postgres enum-validation error at write time, not a
    silent bad write, but this catches it far earlier and more cheaply.
    """
    assert EMOTION_LABELS == ["NEUTRAL", "HAPPY", "SAD", "ANGRY", "FEARFUL", "SURPRISED", "DISGUSTED"]

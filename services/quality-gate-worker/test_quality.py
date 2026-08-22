import numpy as np

from quality import (
    clipping_ratio,
    compute_quality_score,
    crest_factor_db,
    spectral_rolloff_hz,
)
from noise import SAMPLE_RATE


def sine_wave(
    freq: float, duration_s: float, amplitude: float, sample_rate: int = SAMPLE_RATE
) -> np.ndarray:
    t = np.linspace(0, duration_s, int(sample_rate * duration_s), endpoint=False)
    return amplitude * np.sin(2 * np.pi * freq * t)


def test_clipping_ratio_detects_clipped_samples():
    data = np.clip(
        sine_wave(180, 1.0, 2.0), -1.0, 1.0
    )  # amplitude 2.0 clipped to [-1, 1] -> heavy clipping
    assert clipping_ratio(data) > 0.3


def test_clipping_ratio_zero_for_healthy_signal():
    data = sine_wave(180, 1.0, 0.5)
    assert clipping_ratio(data) < 0.01


def test_spectral_rolloff_higher_for_broadband_signal():
    rng = np.random.default_rng(2)
    broadband = rng.normal(0, 0.3, SAMPLE_RATE * 1).astype(np.float32)
    narrowband = sine_wave(200, 1.0, 0.5).astype(np.float32)
    assert spectral_rolloff_hz(broadband) > spectral_rolloff_hz(narrowband)


def test_crest_factor_low_for_heavily_limited_signal():
    # A square-ish wave (heavy limiting) has peak close to RMS -> low crest factor.
    t = np.linspace(0, 1.0, SAMPLE_RATE, endpoint=False)
    square = 0.8 * np.sign(np.sin(2 * np.pi * 180 * t))
    sine = sine_wave(180, 1.0, 0.8)
    assert crest_factor_db(square) < crest_factor_db(sine)


def test_compute_quality_score_penalizes_clipped_audio():
    clean = sine_wave(180, 1.0, 0.5)
    clipped = np.clip(sine_wave(180, 1.0, 3.0), -1.0, 1.0)
    assert compute_quality_score(clipped) < compute_quality_score(clean)


def test_compute_quality_score_in_range():
    data = sine_wave(180, 1.0, 0.5)
    score = compute_quality_score(data)
    assert 0 <= score <= 100

import numpy as np

from noise import SAMPLE_RATE, compute_noise_score, estimate_snr_db, snr_db_to_score


def sine_wave(
    freq: float, duration_s: float, amplitude: float, sample_rate: int = SAMPLE_RATE
) -> np.ndarray:
    t = np.linspace(0, duration_s, int(sample_rate * duration_s), endpoint=False)
    return amplitude * np.sin(2 * np.pi * freq * t)


def speech_like_segment(
    rng: np.random.Generator, duration_s: float, amplitude: float
) -> np.ndarray:
    """
    WebRTC VAD looks for broadband, amplitude-modulated formant-like
    structure, not a pure tone -- a plain sine wave is classified as
    non-speech almost universally. Approximate real speech's shape with a
    handful of harmonics under a slow amplitude envelope (syllable-rate
    modulation) plus a touch of broadband noise, which VAD reliably
    classifies as speech in practice.
    """
    t = np.linspace(0, duration_s, int(SAMPLE_RATE * duration_s), endpoint=False)
    envelope = (
        0.6 + 0.4 * np.sin(2 * np.pi * 4 * t) ** 2
    )  # ~4 Hz syllable-rate modulation
    harmonics = sum(np.sin(2 * np.pi * f * t) for f in (120, 240, 360, 480))
    voiced = amplitude * envelope * (harmonics / 4)
    breath_noise = rng.normal(0, amplitude * 0.05, t.shape)
    return voiced + breath_noise


def test_clean_speech_like_signal_scores_high():
    rng = np.random.default_rng(0)
    speech = speech_like_segment(rng, 1.5, 0.8)
    quiet_gap = rng.normal(0, 0.001, int(SAMPLE_RATE * 0.5))
    data = np.concatenate([speech, quiet_gap]).astype(np.float32)

    score = compute_noise_score(data)
    assert score > 50


def test_noisy_signal_scores_lower_than_clean_signal():
    rng = np.random.default_rng(1)
    clean_speech = speech_like_segment(rng, 1.5, 0.8)
    quiet_gap = rng.normal(0, 0.001, int(SAMPLE_RATE * 0.5))
    clean = np.concatenate([clean_speech, quiet_gap]).astype(np.float32)

    noisy_speech = speech_like_segment(rng, 1.5, 0.8)
    loud_noise_gap = rng.normal(0, 0.3, int(SAMPLE_RATE * 0.5))
    noisy = np.concatenate([noisy_speech, loud_noise_gap]).astype(np.float32)

    assert compute_noise_score(noisy) < compute_noise_score(clean)


def test_snr_db_to_score_clamps_to_0_100():
    assert snr_db_to_score(-50) == 0
    assert snr_db_to_score(500) == 100
    assert snr_db_to_score(15) == 50.0


def test_estimate_snr_db_rejects_wrong_sample_rate():
    data = sine_wave(180, 1.0, 0.5, sample_rate=8000)
    try:
        estimate_snr_db(data, sample_rate=8000)
        assert False, "expected ValueError"
    except ValueError:
        pass

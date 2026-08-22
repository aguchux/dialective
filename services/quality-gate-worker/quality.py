import numpy as np
from scipy.signal import welch

SAMPLE_RATE = 16000

# Clipping: fraction of samples at/near the format's absolute full-scale
# (not the clip's own peak -- a clean sine wave naturally spends samples
# near ITS OWN peak, which is not clipping; true clipping is samples
# pinned near the format's hard ceiling, +-1.0 for the float PCM WAV this
# worker always operates on post-transcode). Even a small clipped fraction
# is audible, so the tolerance here is intentionally tight.
CLIPPING_THRESHOLD = 0.999
MAX_CLIPPED_RATIO = 0.001

# Spectral rolloff: fraction of total spectral energy below which we
# consider the signal "narrowband" (proxy for prior lossy compression or a
# low-quality capture device). A clean 16kHz-capable mic should have
# meaningful energy well past 4kHz for normal speech.
ROLLOFF_ENERGY_FRACTION = 0.85
NARROWBAND_CEILING_HZ = 4000.0

# Dynamic range: peak-to-RMS ratio in dB. Heavily compressed/limited audio
# has a low ratio (loud all the time); a healthy natural recording has more
# headroom between peaks and average level.
MIN_HEALTHY_CREST_FACTOR_DB = 6.0
MAX_HEALTHY_CREST_FACTOR_DB = 20.0


def clipping_ratio(data: np.ndarray) -> float:
    """
    Fraction of samples pinned near the format's absolute full-scale
    (+-1.0 for float PCM), NOT relative to this clip's own peak -- a
    perfectly clean sine wave spends real time near its own peak by
    definition, which must not register as clipping.
    """
    return float(np.mean(np.abs(data) >= CLIPPING_THRESHOLD))


def spectral_rolloff_hz(data: np.ndarray, sample_rate: int = SAMPLE_RATE) -> float:
    """Frequency below which ROLLOFF_ENERGY_FRACTION of total spectral energy lies."""
    freqs, psd = welch(data, fs=sample_rate, nperseg=min(2048, len(data)))
    cumulative = np.cumsum(psd)
    total = cumulative[-1] or 1e-8
    idx = np.searchsorted(cumulative, ROLLOFF_ENERGY_FRACTION * total)
    return float(freqs[min(idx, len(freqs) - 1)])


def crest_factor_db(data: np.ndarray) -> float:
    peak = np.max(np.abs(data))
    rms = np.sqrt(np.mean(data**2))
    eps = 1e-8
    return float(20 * np.log10(max(peak, eps) / max(rms, eps)))


def compute_quality_score(data: np.ndarray, sample_rate: int = SAMPLE_RATE) -> float:
    """
    Combines three independent 0-100 sub-scores (clipping, spectral
    rolloff / narrowband-ness, dynamic range) via a simple average. Each
    sub-score is a smooth penalty, not a hard pass/fail, so a clip that's
    merely borderline on one axis doesn't tank the whole score.
    """
    clip_ratio = clipping_ratio(data)
    clipping_score = (
        100.0 * max(0.0, 1.0 - clip_ratio / MAX_CLIPPED_RATIO)
        if clip_ratio <= MAX_CLIPPED_RATIO * 5
        else 0.0
    )
    clipping_score = max(0.0, min(100.0, clipping_score))

    rolloff = spectral_rolloff_hz(data, sample_rate)
    rolloff_score = max(0.0, min(100.0, (rolloff / NARROWBAND_CEILING_HZ) * 100.0))

    crest = crest_factor_db(data)
    if crest < MIN_HEALTHY_CREST_FACTOR_DB:
        dynamic_range_score = max(0.0, (crest / MIN_HEALTHY_CREST_FACTOR_DB) * 100.0)
    elif crest > MAX_HEALTHY_CREST_FACTOR_DB:
        # Excessive crest factor can indicate mostly-silence with sharp
        # transients rather than a healthy signal -- mild penalty, not a
        # cliff, since the duration/silence prefilter already screens the
        # worst cases of this out before reaching this worker.
        overshoot = crest - MAX_HEALTHY_CREST_FACTOR_DB
        dynamic_range_score = max(0.0, 100.0 - overshoot * 2)
    else:
        dynamic_range_score = 100.0

    return round((clipping_score + rolloff_score + dynamic_range_score) / 3, 2)

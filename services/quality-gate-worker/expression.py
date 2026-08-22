import os

import joblib
import librosa
import numpy as np

from noise import SAMPLE_RATE, _frames

# Emotion label order must exactly match Prisma's SpeechEmotion enum values
# (schema.prisma) -- the classifier's predict_proba column order is
# determined by its training data's label encoding, so any retrain must
# preserve this exact order or db.py's write will fail loudly against
# Postgres's enum type check (see compute_emotion's doc comment below).
EMOTION_LABELS = [
    "NEUTRAL",
    "HAPPY",
    "SAD",
    "ANGRY",
    "FEARFUL",
    "SURPRISED",
    "DISGUSTED",
]

DEFAULT_EMOTION_MODEL_PATH = os.path.join(
    os.path.dirname(__file__), "models", "emotion_classifier.joblib"
)

_emotion_model_cache = None

# Thresholds are coarse, deliberately simple buckets over a continuous
# measurement -- same "derived label from a continuous measurement" posture
# as noise.py's snr_db_to_score, not a claim of precise psychoacoustic
# calibration. Tune from real usage data once speechExpressionEnabled has
# been live for a while, not before.
SPEED_SLOW_MAX = 2.5  # syllables/sec
SPEED_FAST_MIN = 4.5
ENERGY_LOW_MAX_DB = -30.0
ENERGY_HIGH_MIN_DB = -15.0


def extract_prosody_metrics(data: np.ndarray, sample_rate: int = SAMPLE_RATE) -> dict:
    """
    Deterministic acoustic-feature math (no model), mirroring noise.py's
    style. Computed by quality-gate-worker *before* ASR has run, so there is
    no transcript yet -- speechRateEstimate is therefore a syllable/
    energy-peak-rate proxy, not a true word-rate; see the field's schema
    doc comment for why it's named "Estimate" rather than "Wpm".
    """
    y = data.astype(np.float32)

    f0, voiced_flag, _ = librosa.pyin(
        y, sr=sample_rate, fmin=librosa.note_to_hz("C2"), fmax=librosa.note_to_hz("C7")
    )
    voiced_f0 = f0[voiced_flag] if voiced_flag is not None else np.array([])
    mean_pitch_hz = float(np.mean(voiced_f0)) if len(voiced_f0) else None
    pitch_std_hz = float(np.std(voiced_f0)) if len(voiced_f0) else None

    rms = librosa.feature.rms(y=y)[0]
    rms_db = 20 * np.log10(np.maximum(rms, 1e-8))
    mean_rms_db = float(np.mean(rms_db))
    rms_std_db = float(np.std(rms_db))

    # Syllable-nuclei-via-energy-peaks heuristic: count local maxima in the
    # RMS envelope above a modest threshold above the noise floor, a
    # commonly-used lightweight proxy for syllable count when no ASR
    # transcript is available yet.
    threshold = np.percentile(rms, 60)
    is_peak = (rms[1:-1] > rms[:-2]) & (rms[1:-1] > rms[2:]) & (rms[1:-1] > threshold)
    syllable_count = int(np.sum(is_peak))
    duration_s = len(y) / sample_rate
    speech_rate_estimate = (
        float(syllable_count / duration_s) if duration_s > 0 else None
    )

    # Reuses noise.py's own frame-level RMS technique (same FRAME_MS/
    # FRAME_SAMPLES) to estimate the fraction of frames that are
    # near-silent -- an inter-word/inter-sentence pause proxy, independent
    # of noise.py's SNR calculation (which uses frame RMS for a different
    # purpose: noise-floor estimation, not pause detection).
    frames = _frames((np.clip(y, -1.0, 1.0) * 32767).astype(np.int16))
    if frames:
        frame_rms = np.array(
            [np.sqrt(np.mean(frame.astype(np.float64) ** 2)) for frame in frames]
        )
        silence_threshold = np.percentile(frame_rms, 25)
        pause_ratio = float(np.mean(frame_rms <= silence_threshold))
    else:
        pause_ratio = None

    return {
        "speechRateEstimate": round(speech_rate_estimate, 2)
        if speech_rate_estimate is not None
        else None,
        "meanPitchHz": round(mean_pitch_hz, 2) if mean_pitch_hz is not None else None,
        "pitchStdHz": round(pitch_std_hz, 2) if pitch_std_hz is not None else None,
        "meanRmsDb": round(mean_rms_db, 2),
        "rmsStdDb": round(rms_std_db, 2),
        "pauseRatio": round(pause_ratio, 4) if pause_ratio is not None else None,
    }


def bucket_speed(speech_rate_estimate: float | None) -> str | None:
    if speech_rate_estimate is None:
        return None
    if speech_rate_estimate < SPEED_SLOW_MAX:
        return "SLOW"
    if speech_rate_estimate > SPEED_FAST_MIN:
        return "FAST"
    return "NORMAL"


def bucket_energy(mean_rms_db: float | None) -> str | None:
    if mean_rms_db is None:
        return None
    if mean_rms_db < ENERGY_LOW_MAX_DB:
        return "LOW"
    if mean_rms_db > ENERGY_HIGH_MIN_DB:
        return "HIGH"
    return "MEDIUM"


def extract_emotion_features(
    data: np.ndarray, sample_rate: int = SAMPLE_RATE
) -> np.ndarray:
    """
    Same MFCC + delta + delta-delta, mean+std pooled feature pipeline as
    liveness.py::extract_features. Duplicated rather than imported/shared --
    consistent with this codebase's existing per-signal module convention
    (noise.py/quality.py/liveness.py don't share a common base either), and
    keeps this module independently swappable if emotion classification
    ever needs a different feature pipeline than liveness.
    """
    n_mfcc = 20
    mfcc = librosa.feature.mfcc(
        y=data.astype(np.float32), sr=sample_rate, n_mfcc=n_mfcc
    )
    delta = librosa.feature.delta(mfcc)
    delta2 = librosa.feature.delta(mfcc, order=2)
    stacked = np.vstack([mfcc, delta, delta2])
    return np.concatenate([stacked.mean(axis=1), stacked.std(axis=1)])


def load_emotion_model(path: str = DEFAULT_EMOTION_MODEL_PATH):
    global _emotion_model_cache
    if _emotion_model_cache is None:
        _emotion_model_cache = joblib.load(path)
    return _emotion_model_cache


def compute_emotion(
    data: np.ndarray, sample_rate: int = SAMPLE_RATE, model=None
) -> tuple[str, float]:
    """
    Returns (emotion_label, confidence) where emotion_label is one of
    EMOTION_LABELS (must exactly match Prisma's SpeechEmotion enum values --
    a mismatch surfaces as a loud Postgres enum-validation error on write,
    not a silent bad write, see db.py::write_expression). Shallow classifier
    over classical MFCC features, same posture as liveness.py's anti-
    spoofing classifier: CPU-only, no GPU/deep-model requirement. Trained
    offline against a public speech-emotion corpus (e.g. RAVDESS/CREMA-D) --
    both are English-heavy, not dialect-specific, so cross-dialect emotion
    accuracy is an explicit known limitation, same posture as liveness.py's
    own accuracy-ceiling disclosure. See models/README.md for provenance.
    """
    clf = model if model is not None else load_emotion_model()
    features = extract_emotion_features(data, sample_rate).reshape(1, -1)
    proba = clf.predict_proba(features)[0]
    top_index = int(np.argmax(proba))
    return EMOTION_LABELS[top_index], round(float(proba[top_index]), 4)

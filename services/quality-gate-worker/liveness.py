import os

import joblib
import librosa
import numpy as np

SAMPLE_RATE = 16000
N_MFCC = 20  # LFCC is not natively in librosa; MFCC over a linear-ish mel scale is the practical CPU-only substitute, same spirit as classical LFCC-based ASVspoof baselines
DEFAULT_MODEL_PATH = os.path.join(os.path.dirname(__file__), "models", "liveness_classifier.joblib")

_model_cache = None


def extract_features(data: np.ndarray, sample_rate: int = SAMPLE_RATE) -> np.ndarray:
    """
    MFCC + delta + delta-delta, mean+std pooled across time into a single
    fixed-length feature vector -- the standard classical-features
    pipeline for a frame-level acoustic signal feeding a non-sequential
    classifier (logistic regression / GBM), matching the
    LFCC/CQCC-plus-shallow-classifier shape that was the strong CPU-only
    baseline in the ASVspoof challenges before end-to-end deep
    countermeasures existed.
    """
    mfcc = librosa.feature.mfcc(y=data.astype(np.float32), sr=sample_rate, n_mfcc=N_MFCC)
    delta = librosa.feature.delta(mfcc)
    delta2 = librosa.feature.delta(mfcc, order=2)

    stacked = np.vstack([mfcc, delta, delta2])
    return np.concatenate([stacked.mean(axis=1), stacked.std(axis=1)])


def load_model(path: str = DEFAULT_MODEL_PATH):
    global _model_cache
    if _model_cache is None:
        _model_cache = joblib.load(path)
    return _model_cache


def compute_liveness_score(data: np.ndarray, sample_rate: int = SAMPLE_RATE, model=None) -> float:
    """
    Returns a 0-100 confidence that `data` is live human speech (not
    TTS/replay/synthetic). The classifier is trained offline against a
    public anti-spoofing corpus (e.g. ASVspoof) and shipped as a small
    joblib artifact baked into this service's Docker image -- see
    services/quality-gate-worker/models/README (or equivalent) for the
    training/evaluation notes and the artifact's provenance.

    This score is never used as a hard gate (see PlatformSettings.
    qualityGateEnabled/qualityWeightLiveness) -- only as one input to the
    payout composite score -- so a classifier with real-world accuracy
    below GPU-class anti-spoofing models is an acceptable, explicit
    tradeoff (see the plan's phasing/rollout notes), not a correctness bug.
    """
    clf = model if model is not None else load_model()
    features = extract_features(data, sample_rate).reshape(1, -1)
    # predict_proba's positive class is expected to be "live" (label 1);
    # the shipped model's training script is responsible for that
    # convention -- see the training notes alongside the artifact.
    proba_live = clf.predict_proba(features)[0][1]
    return round(float(proba_live) * 100, 2)

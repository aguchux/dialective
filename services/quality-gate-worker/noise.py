import numpy as np
import webrtcvad

SAMPLE_RATE = 16000
FRAME_MS = 30
FRAME_SAMPLES = int(SAMPLE_RATE * FRAME_MS / 1000)
VAD_AGGRESSIVENESS = 2  # 0 (least aggressive) - 3 (most aggressive); 2 is a reasonable middle ground for noisy field recordings

# dB-to-score mapping: 0dB (noise as loud as speech) -> 0, 30dB+ (very clean) -> 100.
MIN_SNR_DB = 0.0
MAX_SNR_DB = 30.0


def _frames(data: np.ndarray) -> list:
    frames = []
    for start in range(0, len(data) - FRAME_SAMPLES + 1, FRAME_SAMPLES):
        frames.append(data[start : start + FRAME_SAMPLES])
    return frames


NOISE_FLOOR_PERCENTILE = 15  # bottom 15% of frames by RMS energy stand in for the noise floor


def estimate_snr_db(data: np.ndarray, sample_rate: int = SAMPLE_RATE) -> float:
    """
    Segments 16kHz mono PCM into 30ms frames. WebRTC VAD reliably flags
    speech-containing frames, so those become the "signal" bucket -- but
    VAD's complementary "not speech" label is NOT a reliable noise-floor
    proxy: broadband interference (e.g. a fan, crowd chatter, white-noise-
    like background) is loud enough that VAD's energy-based classifier
    often calls it speech too (confirmed empirically: WebRTC VAD at every
    aggressiveness level classifies plain white noise as speech in
    practice), which would make loud background noise invisible to a
    VAD-labeled-noise-frames approach -- the exact case this signal most
    needs to catch. Instead, the noise floor is estimated as the bottom
    NOISE_FLOOR_PERCENTILE of ALL frames by RMS energy, independent of
    VAD's speech/non-speech label -- during actual speech, the quietest
    frames (inter-word gaps, breath pauses) are dominated by whatever
    background noise is present, so this percentile-floor approach tracks
    background noise level regardless of whether VAD mislabels it.
    Falls back to a neutral 0dB (worst case, not a crash) if either
    bucket ends up empty, which shouldn't normally happen post-prefilter
    but must not raise on an unexpected edge case.
    """
    if sample_rate != SAMPLE_RATE:
        raise ValueError(f"estimate_snr_db expects {SAMPLE_RATE}Hz audio, got {sample_rate}Hz")

    int16_data = (np.clip(data, -1.0, 1.0) * 32767).astype(np.int16) if data.dtype != np.int16 else data
    vad = webrtcvad.Vad(VAD_AGGRESSIVENESS)

    all_frames = _frames(int16_data)
    if not all_frames:
        return 0.0

    frame_rms = np.array([np.sqrt(np.mean(frame.astype(np.float64) ** 2)) for frame in all_frames])
    is_speech = np.array([vad.is_speech(frame.tobytes(), sample_rate) for frame in all_frames])

    eps = 1e-8
    speech_rms_values = frame_rms[is_speech]
    speech_rms = float(np.mean(speech_rms_values)) if len(speech_rms_values) else eps

    floor_count = max(1, int(len(frame_rms) * NOISE_FLOOR_PERCENTILE / 100))
    noise_rms = float(np.mean(np.sort(frame_rms)[:floor_count]))

    return float(20 * np.log10(max(speech_rms, eps) / max(noise_rms, eps)))


def snr_db_to_score(snr_db: float) -> float:
    """Linear map, clamped to [0, 100]."""
    clamped = max(MIN_SNR_DB, min(MAX_SNR_DB, snr_db))
    return round((clamped - MIN_SNR_DB) / (MAX_SNR_DB - MIN_SNR_DB) * 100, 2)


def compute_noise_score(data: np.ndarray, sample_rate: int = SAMPLE_RATE) -> float:
    return snr_db_to_score(estimate_snr_db(data, sample_rate))

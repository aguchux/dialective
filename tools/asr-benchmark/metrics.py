"""Word/Character Error Rate via jiwer -- no WER/CER library existed anywhere
in this repo before this tool, so jiwer is a new dependency scoped to
tools/asr-benchmark/requirements.txt only, not added to any service."""

import jiwer


def word_error_rate(reference: str, hypothesis: str) -> float:
    if not reference.strip():
        return 0.0 if not hypothesis.strip() else 1.0
    return jiwer.wer(reference, hypothesis)


def character_error_rate(reference: str, hypothesis: str) -> float:
    if not reference.strip():
        return 0.0 if not hypothesis.strip() else 1.0
    return jiwer.cer(reference, hypothesis)

"""Unit tests for the pure helpers. No torch, no network:
pytest tools/asr-finetune/test_common.py"""

from common import (
    clean_label,
    normalize_for_scoring,
    registry_checkpoint,
    speaker_hash,
    split_for_speaker,
)


def test_speaker_hash_is_stable_and_not_the_raw_id():
    uid = "3fe8f747-b839-4e3b-961b-dfca57bde6c9"
    assert speaker_hash(uid) == speaker_hash(uid)
    assert uid not in speaker_hash(uid)
    assert speaker_hash(uid) != speaker_hash("someone-else")


def test_every_clip_of_a_speaker_lands_in_one_split():
    spk = speaker_hash("u1")
    assert len({split_for_speaker(spk, 10, 5) for _ in range(5)}) == 1


def test_split_proportions_are_roughly_respected():
    splits = [split_for_speaker(speaker_hash(f"user-{i}"), 10, 5) for i in range(5000)]
    assert 0.08 < splits.count("test") / 5000 < 0.12
    assert 0.03 < splits.count("dev") / 5000 < 0.07


def test_scoring_normalization_keeps_tone_marks_but_drops_case_and_punctuation():
    assert normalize_for_scoring("Ẹ̀kọ́, ILÉ!") == normalize_for_scoring("ẹ̀kọ́ ilé")
    # a tone mark is a different word in Yoruba -- must not be stripped
    assert normalize_for_scoring("ilé") != normalize_for_scoring("ile")


def test_clean_label_preserves_case_and_collapses_whitespace():
    assert clean_label("  Zafi   sosai \n") == "Zafi sosai"


def test_registry_lookup_matches_the_production_registry():
    assert registry_checkpoint("ha") == "NCAIR1/Hausa-ASR"
    assert registry_checkpoint("en-us") is None  # vosk, not whisper
    assert registry_checkpoint("ibb") is None  # no checkpoint exists yet

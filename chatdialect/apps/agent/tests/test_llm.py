from providers.llm import ALLOWED_EMOTIONS, _validate_response


def test_valid_response_passes_through():
    result = _validate_response(
        {"text": "Hello!", "emotion": {"type": "happy", "intensity": 0.6}}
    )
    assert result.text == "Hello!"
    assert result.emotion.type == "happy"
    assert result.emotion.intensity == 0.6


def test_unknown_emotion_type_falls_back_to_neutral():
    result = _validate_response(
        {"text": "Hello!", "emotion": {"type": "excited", "intensity": 0.9}}
    )
    assert result.emotion.type == "neutral"
    assert result.emotion.intensity == 0.0


def test_missing_emotion_falls_back_to_neutral():
    result = _validate_response({"text": "Hello!"})
    assert result.emotion.type == "neutral"
    assert result.emotion.intensity == 0.0


def test_non_numeric_intensity_falls_back_to_neutral():
    result = _validate_response(
        {"text": "Hello!", "emotion": {"type": "happy", "intensity": "high"}}
    )
    assert result.emotion.type == "neutral"
    assert result.emotion.intensity == 0.0


def test_intensity_is_clamped_to_0_1_range():
    result = _validate_response(
        {"text": "Hello!", "emotion": {"type": "concerned", "intensity": 5}}
    )
    assert result.emotion.intensity == 1.0

    result = _validate_response(
        {"text": "Hello!", "emotion": {"type": "concerned", "intensity": -3}}
    )
    assert result.emotion.intensity == 0.0


def test_allowed_emotions_matches_shared_types_avatar_emotion():
    # Must stay in sync with packages/shared-types's AvatarEmotion union --
    # doc §12: never allow arbitrary emotion names from the LLM to flow
    # into the renderer.
    assert ALLOWED_EMOTIONS == {"neutral", "happy", "concerned", "confused"}

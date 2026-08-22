"""
No existing test file covered whisper-worker before this feature -- this is
net-new test infrastructure for this service. token_crypto.py is a
byte-for-byte Python port of services/api/src/common/token-crypto.util.ts;
a silent mismatch between the two (wrong scrypt params, wrong GCM tag
handling) would make every admin-saved API token undecryptable in
production without any error until the worker actually tries to use it, so
this is worth covering even though nothing else in this service has tests
yet.
"""

import base64

import pytest
from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from token_crypto import _derive_key, decrypt_token

PASSPHRASE = "test-passphrase-do-not-use-in-prod"


def _encrypt_like_node(plaintext: str, passphrase: str = PASSPHRASE) -> tuple[str, str, str]:
    """Re-implements token-crypto.util.ts's encryptToken() using this module's own _derive_key, so a round-trip test here doesn't depend on Node being available."""
    key = _derive_key(passphrase)
    iv = b"\x01" * 12
    ciphertext_and_tag = AESGCM(key).encrypt(iv, plaintext.encode("utf-8"), None)
    ciphertext, tag = ciphertext_and_tag[:-16], ciphertext_and_tag[-16:]
    return (
        base64.b64encode(ciphertext).decode(),
        base64.b64encode(iv).decode(),
        base64.b64encode(tag).decode(),
    )


def test_round_trips_a_plaintext_value():
    encrypted_value, iv, auth_tag = _encrypt_like_node("hf_super_secret_token_value")
    assert decrypt_token(encrypted_value, iv, auth_tag, PASSPHRASE) == "hf_super_secret_token_value"


def test_derives_the_same_key_as_nodes_scryptsync_for_a_known_input():
    """
    Cross-language pin: this exact (passphrase, salt, N/r/p/dklen) tuple was
    verified during development to produce the identical 32-byte key as
    Node's crypto.scryptSync('test-passphrase-do-not-use-in-prod',
    'dialectiva-api-access-token-v1', 32) -- see token-crypto.util.ts. If this
    assertion ever fails, either this file or the Node util's key-derivation
    parameters have drifted, and every previously-saved ApiAccessToken
    becomes undecryptable.
    """
    key = _derive_key(PASSPHRASE)
    assert key.hex() == "88030257cd26eea6242b6fb7b70549eb9b1c2c1fc4d29fb7e86a561dfef6b144"


def test_raises_when_the_auth_tag_is_tampered_with():
    encrypted_value, iv, _auth_tag = _encrypt_like_node("hf_super_secret_token_value")
    tampered_tag = base64.b64encode(b"0" * 16).decode()
    with pytest.raises(InvalidTag):
        decrypt_token(encrypted_value, iv, tampered_tag, PASSPHRASE)


def test_raises_when_the_passphrase_is_wrong():
    encrypted_value, iv, auth_tag = _encrypt_like_node("hf_super_secret_token_value")
    with pytest.raises(InvalidTag):
        decrypt_token(encrypted_value, iv, auth_tag, "a-completely-different-passphrase")

import base64
import hashlib

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

# Mirrors services/api/src/common/token-crypto.util.ts exactly -- api writes
# ApiAccessToken.encryptedValue/iv/authTag via Node's crypto.scryptSync +
# createCipheriv('aes-256-gcm', ...); this decrypts it here since
# whisper-worker (Python) can't call back into api's DI container to ask for
# the plaintext. Both sides must agree on every parameter below byte-for-byte
# -- verified against Node's scryptSync output during development (same
# passphrase + salt + N=16384/r=8/p=1/dklen=32 produces an identical key).
_KEY_DERIVATION_SALT = b"dialectiva-api-access-token-v1"
_SCRYPT_N = 16384
_SCRYPT_R = 8
_SCRYPT_P = 1
_KEY_LEN = 32


def _derive_key(passphrase: str) -> bytes:
    return hashlib.scrypt(
        passphrase.encode("utf-8"),
        salt=_KEY_DERIVATION_SALT,
        n=_SCRYPT_N,
        r=_SCRYPT_R,
        p=_SCRYPT_P,
        dklen=_KEY_LEN,
        maxmem=64 * 1024 * 1024,
    )


def decrypt_token(
    encrypted_value_b64: str, iv_b64: str, auth_tag_b64: str, passphrase: str
) -> str:
    """Reverses token-crypto.util.ts's encryptToken(). Raises InvalidTag (cryptography.exceptions) if the ciphertext/auth_tag don't match -- never returns a silently-wrong value."""
    key = _derive_key(passphrase)
    iv = base64.b64decode(iv_b64)
    ciphertext = base64.b64decode(encrypted_value_b64)
    auth_tag = base64.b64decode(auth_tag_b64)
    plaintext = AESGCM(key).decrypt(iv, ciphertext + auth_tag, None)
    return plaintext.decode("utf-8")

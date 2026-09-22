import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

/**
 * The payload a QR code carries.
 *
 * What is NOT here is the point. The plan is explicit: never encode the
 * photograph, the signature image, KYC data or the contributor profile into
 * a QR code, because a QR payload is trivially copied and decoded by anyone
 * who can see the document. A printed certificate ends up on desks, in
 * slide decks and in photographs.
 *
 * So the QR carries only enough to LOOK SOMETHING UP: which licence,
 * which version, what the document claimed, and a nonce. Everything a
 * scanner learns beyond that comes from the verification endpoint, which
 * decides what to disclose based on who is asking.
 */
export interface VerificationPayload {
  /** Licence version id -- what to look up. */
  v: string;
  /** Version number, so a scan of an old document is self-describing. */
  n: number;
  /** Manifest hash the document asserted, truncated for QR density. */
  h: string;
  /** Per-document nonce, so two issues of the same version differ. */
  z: string;
}

const HMAC_BYTES = 16; // 128 bits, truncated -- ample against forgery here
const NONCE_BYTES = 8;
const HASH_PREFIX_LEN = 16;

function secret(): string {
  const value = process.env.VDCL_VERIFICATION_SECRET;
  if (!value || value.length < 16) {
    // Failing loudly beats signing with a weak or absent key: a token
    // signed with an empty secret would verify for anyone who noticed.
    throw new Error(
      'VDCL_VERIFICATION_SECRET must be set to at least 16 characters to issue or verify licence QR tokens',
    );
  }
  return value;
}

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64url(value: string): Buffer {
  return Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function sign(body: string): string {
  return base64url(createHmac('sha256', secret()).update(body).digest().subarray(0, HMAC_BYTES));
}

/**
 * Build a signed verification token.
 *
 * The signature is what stops someone printing their own certificate with a
 * QR pointing at a licence id they invented, or editing the metrics on a
 * real one and re-encoding it. Without it the QR would be a bare link and
 * the verification page would confirm whatever it was handed.
 */
export function issueVerificationToken(params: {
  versionId: string;
  version: number;
  manifestHash: string;
}): { token: string; nonce: string } {
  const nonce = base64url(randomBytes(NONCE_BYTES));
  const payload: VerificationPayload = {
    v: params.versionId,
    n: params.version,
    h: params.manifestHash.slice(0, HASH_PREFIX_LEN),
    z: nonce,
  };
  const body = base64url(Buffer.from(JSON.stringify(payload), 'utf8'));
  return { token: `${body}.${sign(body)}`, nonce };
}

/**
 * Verify and decode a token.
 *
 * Returns null rather than throwing on ANY failure -- malformed, wrong
 * signature, unparseable. A public verification endpoint must not
 * distinguish between "this token is a forgery" and "this token is
 * gibberish", because the difference tells a forger which half to fix.
 */
export function readVerificationToken(token: string): VerificationPayload | null {
  try {
    const [body, signature] = token.split('.');
    if (!body || !signature) return null;

    const expected = Buffer.from(sign(body), 'utf8');
    const actual = Buffer.from(signature, 'utf8');
    // Constant-time, so response timing cannot be used to recover a valid
    // signature byte by byte.
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      return null;
    }

    const parsed = JSON.parse(fromBase64url(body).toString('utf8')) as VerificationPayload;
    if (
      typeof parsed.v !== 'string' ||
      typeof parsed.n !== 'number' ||
      typeof parsed.h !== 'string' ||
      typeof parsed.z !== 'string'
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * The URL a QR encodes.
 *
 * Built from FRONTEND_URL, which already points at the public site, rather
 * than a VDCL-specific variable: the verification page lives there, and a
 * second source of truth for the same host is a way for a printed QR to
 * end up pointing somewhere that no longer serves it.
 */
export function verificationUrl(token: string): string {
  const base = (process.env.FRONTEND_URL ?? 'https://dialectlibrary.com').replace(/\/+$/, '');
  return `${base}/verify/${token}`;
}

export { HASH_PREFIX_LEN };

import {
  issueVerificationToken,
  readVerificationToken,
  verificationUrl,
} from './verification-token.util';

/**
 * The QR token is the one part of this product a stranger holds in their
 * hand. Two properties matter:
 *
 * 1. It cannot be forged. Without a signature, anyone could print a
 *    certificate whose QR points at a licence id they invented, and the
 *    verification page would confirm it.
 *
 * 2. It carries almost nothing. A QR payload is trivially decoded by
 *    anyone who photographs the document, so what is NOT in it is the
 *    security property.
 */
describe('VDCL verification token', () => {
  const ORIGINAL = process.env.VDCL_VERIFICATION_SECRET;

  beforeEach(() => {
    process.env.VDCL_VERIFICATION_SECRET = 'test-secret-at-least-16-chars';
  });

  afterAll(() => {
    process.env.VDCL_VERIFICATION_SECRET = ORIGINAL;
  });

  const params = {
    versionId: 'a3f1c2d4-0000-4000-8000-000000000001',
    version: 2,
    manifestHash: 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
  };

  it('round-trips a token it issued', () => {
    const { token } = issueVerificationToken(params);
    const payload = readVerificationToken(token);
    expect(payload).toMatchObject({ v: params.versionId, n: 2 });
  });

  it('carries no identity, only a lookup key', () => {
    // Everything a scanner learns beyond this comes from the verification
    // endpoint, which decides what to disclose.
    const { token } = issueVerificationToken(params);
    const payload = readVerificationToken(token)!;
    expect(Object.keys(payload).sort()).toEqual(['h', 'n', 'v', 'z']);
  });

  it('rejects a tampered payload', () => {
    // Editing the metrics on a real certificate and re-encoding must not
    // produce something that verifies.
    const { token } = issueVerificationToken(params);
    const [body, sig] = token.split('.');
    const forged = Buffer.from(
      JSON.stringify({ v: 'someone-elses-licence', n: 1, h: 'aaaa', z: 'zz' }),
      'utf8',
    )
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    expect(readVerificationToken(`${forged}.${sig}`)).toBeNull();
    expect(body).not.toBe(forged);
  });

  it('rejects a token signed with a different secret', () => {
    const { token } = issueVerificationToken(params);
    process.env.VDCL_VERIFICATION_SECRET = 'a-completely-different-secret';
    expect(readVerificationToken(token)).toBeNull();
  });

  it.each([
    ['empty', ''],
    ['no separator', 'abcdef'],
    ['no signature', 'abcdef.'],
    ['garbage', 'not-a-token-at-all'],
    ['unparseable body', 'bm90LWpzb24.deadbeef'],
  ])('returns null rather than throwing for a %s token', (_label, token) => {
    // A public endpoint must not distinguish forgery from gibberish --
    // the difference tells a forger which half to fix.
    expect(readVerificationToken(token)).toBeNull();
  });

  it('gives two issues of the same version different tokens', () => {
    // The nonce means a re-issued document is distinguishable from the
    // original even though both describe the same licence.
    const a = issueVerificationToken(params);
    const b = issueVerificationToken(params);
    expect(a.token).not.toBe(b.token);
    expect(a.nonce).not.toBe(b.nonce);
  });

  it('refuses to issue without a secret configured', () => {
    // A token signed with an empty secret would verify for anyone who
    // noticed, so failing loudly beats signing weakly.
    delete process.env.VDCL_VERIFICATION_SECRET;
    expect(() => issueVerificationToken(params)).toThrow(/VDCL_VERIFICATION_SECRET/);
  });

  it('refuses a secret that is too short', () => {
    process.env.VDCL_VERIFICATION_SECRET = 'short';
    expect(() => issueVerificationToken(params)).toThrow(/VDCL_VERIFICATION_SECRET/);
  });

  it('truncates the manifest hash rather than carrying all of it', () => {
    // Print density is a real constraint: a QR nobody can scan from a
    // photographed certificate is not fit for purpose.
    const payload = readVerificationToken(issueVerificationToken(params).token)!;
    expect(payload.h).toBe(params.manifestHash.slice(0, 16));
    expect(payload.h.length).toBeLessThan(params.manifestHash.length);
  });

  it('builds a URL a scanner can open', () => {
    const { token } = issueVerificationToken(params);
    expect(verificationUrl(token)).toContain(`/verify/${token}`);
  });
});

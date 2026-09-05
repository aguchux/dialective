import * as jwt from 'jsonwebtoken';
import { signM2mToken, verifyM2mToken } from './oauth-m2m-jwt.util';

describe('oauth-m2m-jwt.util', () => {
  const originalSecret = process.env.OAUTH_M2M_JWT_SECRET;
  const originalTtl = process.env.OAUTH_M2M_TOKEN_TTL;

  beforeEach(() => {
    process.env.OAUTH_M2M_JWT_SECRET = 'test-secret';
  });

  afterEach(() => {
    process.env.OAUTH_M2M_JWT_SECRET = originalSecret;
    process.env.OAUTH_M2M_TOKEN_TTL = originalTtl;
  });

  it('round-trips claims through sign and verify', () => {
    const claims = {
      sub: 'dlm2m_abc',
      organizationId: 'org-1',
      deckId: 'deck-1',
      scopes: ['MANIFEST_READ' as const],
    };

    const { token, expiresInSeconds } = signM2mToken(claims);
    const verified = verifyM2mToken(token);

    expect(verified).toMatchObject(claims);
    expect(expiresInSeconds).toBeGreaterThan(0);
  });

  it('rejects a token signed with a different secret', () => {
    const { token } = signM2mToken({
      sub: 'dlm2m_abc',
      organizationId: 'org-1',
      deckId: null,
      scopes: [],
    });

    process.env.OAUTH_M2M_JWT_SECRET = 'a-different-secret';

    expect(() => verifyM2mToken(token)).toThrow();
  });

  it('rejects an already-expired token', () => {
    process.env.OAUTH_M2M_TOKEN_TTL = '1s';
    const { token } = signM2mToken({
      sub: 'dlm2m_abc',
      organizationId: 'org-1',
      deckId: null,
      scopes: [],
    });
    const decoded = jwt.decode(token) as { exp: number };
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue((decoded.exp + 5) * 1000);

    expect(() => verifyM2mToken(token)).toThrow();
    nowSpy.mockRestore();
  });

  it('throws when OAUTH_M2M_JWT_SECRET is not set', () => {
    delete process.env.OAUTH_M2M_JWT_SECRET;

    expect(() =>
      signM2mToken({ sub: 'dlm2m_abc', organizationId: 'org-1', deckId: null, scopes: [] }),
    ).toThrow('OAUTH_M2M_JWT_SECRET is not set');
  });

  it('rejects a token signed with alg=none (alg-confusion attack)', () => {
    const claims = { sub: 'dlm2m_abc', organizationId: 'org-1', deckId: null, scopes: [] };
    const forgedToken = jwt.sign(claims, '', { algorithm: 'none' });

    expect(() => verifyM2mToken(forgedToken)).toThrow();
  });

  it('rejects a token signed with a different algorithm than HS256', () => {
    const claims = { sub: 'dlm2m_abc', organizationId: 'org-1', deckId: null, scopes: [] };
    // HS384 using the same secret string would still verify successfully if
    // the allowed-algorithms list were derived from the token header instead
    // of pinned server-side.
    const token = jwt.sign(claims, 'test-secret', { algorithm: 'HS384' });

    expect(() => verifyM2mToken(token)).toThrow();
  });
});

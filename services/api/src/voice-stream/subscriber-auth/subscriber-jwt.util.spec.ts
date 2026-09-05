import * as jwt from 'jsonwebtoken';
import { SubscriberOrgRole } from '@dialectiva/db';
import { signSubscriberAccessToken, verifySubscriberAccessToken } from './subscriber-jwt.util';

describe('subscriber-jwt.util', () => {
  const originalSecret = process.env.STREAM_JWT_ACCESS_SECRET;
  const originalTtl = process.env.STREAM_ACCESS_TOKEN_TTL;

  beforeEach(() => {
    process.env.STREAM_JWT_ACCESS_SECRET = 'test-secret';
  });

  afterEach(() => {
    process.env.STREAM_JWT_ACCESS_SECRET = originalSecret;
    process.env.STREAM_ACCESS_TOKEN_TTL = originalTtl;
  });

  const claims = {
    sub: 'user-1',
    email: 'user@example.com',
    organizationId: 'org-1',
    orgRole: SubscriberOrgRole.VALIDATOR,
  };

  it('round-trips claims through sign and verify', () => {
    const token = signSubscriberAccessToken(claims);
    const verified = verifySubscriberAccessToken(token);

    expect(verified).toMatchObject(claims);
  });

  it('rejects a token signed with a different secret', () => {
    const token = signSubscriberAccessToken(claims);

    process.env.STREAM_JWT_ACCESS_SECRET = 'a-different-secret';

    expect(() => verifySubscriberAccessToken(token)).toThrow();
  });

  it('rejects an already-expired token', () => {
    process.env.STREAM_ACCESS_TOKEN_TTL = '1s';
    const token = signSubscriberAccessToken(claims);
    const decoded = jwt.decode(token) as { exp: number };
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue((decoded.exp + 5) * 1000);

    expect(() => verifySubscriberAccessToken(token)).toThrow();
    nowSpy.mockRestore();
  });

  it('throws when STREAM_JWT_ACCESS_SECRET is not set', () => {
    delete process.env.STREAM_JWT_ACCESS_SECRET;

    expect(() => signSubscriberAccessToken(claims)).toThrow('STREAM_JWT_ACCESS_SECRET is not set');
  });

  it('rejects a token signed with alg=none (alg-confusion attack)', () => {
    const forgedToken = jwt.sign(claims, '', { algorithm: 'none' });

    expect(() => verifySubscriberAccessToken(forgedToken)).toThrow();
  });

  it('rejects a token signed with a different algorithm than HS256', () => {
    // HS384 using the same secret string would still verify successfully if
    // the allowed-algorithms list were derived from the token header instead
    // of pinned server-side.
    const token = jwt.sign(claims, 'test-secret', { algorithm: 'HS384' });

    expect(() => verifySubscriberAccessToken(token)).toThrow();
  });
});

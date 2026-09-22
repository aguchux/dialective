import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { OAuthJwtAuthGuard } from './oauth-jwt-auth.guard';
import { signM2mToken } from './oauth-m2m-jwt.util';
import { AuthenticatedStreamKeyRequest } from '../stream-api/stream-key-auth.guard';

function contextWith(req: Partial<AuthenticatedStreamKeyRequest>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

describe('OAuthJwtAuthGuard', () => {
  const originalSecret = process.env.OAUTH_M2M_JWT_SECRET;

  beforeEach(() => {
    process.env.OAUTH_M2M_JWT_SECRET = 'test-secret';
  });

  afterEach(() => {
    process.env.OAUTH_M2M_JWT_SECRET = originalSecret;
  });

  it('rejects a request with no Authorization header', () => {
    const guard = new OAuthJwtAuthGuard();
    const req: Partial<AuthenticatedStreamKeyRequest> = { headers: {} } as never;

    expect(() => guard.canActivate(contextWith(req))).toThrow(UnauthorizedException);
  });

  it('rejects an invalid token', () => {
    const guard = new OAuthJwtAuthGuard();
    const req: Partial<AuthenticatedStreamKeyRequest> = {
      headers: { authorization: 'Bearer not-a-real-jwt' },
    } as never;

    expect(() => guard.canActivate(contextWith(req))).toThrow(UnauthorizedException);
  });

  it('populates request.streamKey with credentialType oauth_client on a valid token', () => {
    const guard = new OAuthJwtAuthGuard();
    const { token } = signM2mToken({
      sub: 'dlm2m_abc',
      organizationId: 'org-1',
      deckId: 'deck-1',
      scopes: ['MANIFEST_READ' as never],
    });
    const req: Partial<AuthenticatedStreamKeyRequest> = {
      headers: { authorization: `Bearer ${token}` },
    } as never;

    const result = guard.canActivate(contextWith(req));

    expect(result).toBe(true);
    expect((req as AuthenticatedStreamKeyRequest).streamKey).toEqual({
      id: 'dlm2m_abc',
      organizationId: 'org-1',
      deckId: 'deck-1',
      scopes: ['MANIFEST_READ'],
      purposes: [],
      credentialType: 'oauth_client',
    });
  });
});

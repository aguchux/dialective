import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { OptionalJwtAuthGuard, OptionallyAuthenticatedRequest } from './optional-jwt-auth.guard';
import * as jwt from 'jsonwebtoken';
import { signAccessToken } from '../jwt.util';
import { Role } from '@dialectiva/db';

function contextFor(request: Partial<OptionallyAuthenticatedRequest>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('OptionalJwtAuthGuard', () => {
  const guard = new OptionalJwtAuthGuard();
  const originalSecret = process.env.JWT_ACCESS_SECRET;

  beforeAll(() => {
    process.env.JWT_ACCESS_SECRET = 'test-access-secret';
  });

  afterAll(() => {
    process.env.JWT_ACCESS_SECRET = originalSecret;
  });

  it('allows an anonymous request through with no user', () => {
    const request = { headers: {} } as OptionallyAuthenticatedRequest;

    expect(guard.canActivate(contextFor(request))).toBe(true);
    expect(request.user).toBeUndefined();
  });

  it('authenticates a valid bearer token', () => {
    const token = signAccessToken({ sub: 'user-1', email: 'a@b.com', role: Role.TRAINER });
    const request = {
      headers: { authorization: `Bearer ${token}` },
    } as OptionallyAuthenticatedRequest;

    expect(guard.canActivate(contextFor(request))).toBe(true);
    expect(request.user?.sub).toBe('user-1');
  });

  // The outage this guard caused: community feeds 401'd for signed-in
  // viewers whose token had expired, while anonymous viewers loaded them.
  it('treats an EXPIRED token as anonymous instead of rejecting it', () => {
    const staleToken = jwt.sign(
      { sub: 'user-1', email: 'a@b.com', role: Role.TRAINER },
      'test-access-secret',
      { expiresIn: '-1s' },
    );

    const request = {
      headers: { authorization: `Bearer ${staleToken}` },
    } as OptionallyAuthenticatedRequest;

    expect(guard.canActivate(contextFor(request))).toBe(true);
    expect(request.user).toBeUndefined();
  });

  it('treats a token signed with the wrong secret as anonymous', () => {
    const foreign = jwt.sign({ sub: 'user-1', email: 'a@b.com', role: Role.TRAINER }, 'other');
    const request = {
      headers: { authorization: `Bearer ${foreign}` },
    } as OptionallyAuthenticatedRequest;

    expect(guard.canActivate(contextFor(request))).toBe(true);
    expect(request.user).toBeUndefined();
  });

  it('treats a garbage token as anonymous', () => {
    const request = {
      headers: { authorization: 'Bearer not-a-jwt' },
    } as OptionallyAuthenticatedRequest;

    expect(guard.canActivate(contextFor(request))).toBe(true);
    expect(request.user).toBeUndefined();
  });

  // Still a caller bug, not a lapsed session -- keep failing loudly.
  it('rejects a malformed authorization header', () => {
    const request = {
      headers: { authorization: 'Basic abc123' },
    } as OptionallyAuthenticatedRequest;

    expect(() => guard.canActivate(contextFor(request))).toThrow(UnauthorizedException);
  });
});

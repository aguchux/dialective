import { UnauthorizedException } from '@nestjs/common';
import { ExecutionContext } from '@nestjs/common';
import { hashToken } from '../../auth/token.util';
import { StreamKeyAuthGuard } from './stream-key-auth.guard';

function contextWith(req: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

function setup() {
  const prisma = {
    streamApiKey: { findUnique: jest.fn(), update: jest.fn().mockResolvedValue({}) },
  };
  const guard = new StreamKeyAuthGuard(prisma as never);
  return { guard, prisma };
}

describe('StreamKeyAuthGuard', () => {
  it('rejects a missing Authorization header', async () => {
    const { guard } = setup();
    const req = { headers: {} };
    await expect(guard.canActivate(contextWith(req))).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a malformed (non-Bearer) header', async () => {
    const { guard } = setup();
    const req = { headers: { authorization: 'Basic abc' } };
    await expect(guard.canActivate(contextWith(req))).rejects.toThrow(UnauthorizedException);
  });

  it('rejects an unknown key hash', async () => {
    const { guard, prisma } = setup();
    prisma.streamApiKey.findUnique.mockResolvedValue(null);
    const req = { headers: { authorization: 'Bearer dlsk_live_bogus' } };
    await expect(guard.canActivate(contextWith(req))).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a revoked key', async () => {
    const { guard, prisma } = setup();
    prisma.streamApiKey.findUnique.mockResolvedValue({
      id: 'key-1',
      revokedAt: new Date(),
      expiresAt: null,
      allowedIps: [],
    });
    const req = { headers: { authorization: 'Bearer dlsk_live_x' } };
    await expect(guard.canActivate(contextWith(req))).rejects.toThrow(UnauthorizedException);
  });

  it('rejects an expired key', async () => {
    const { guard, prisma } = setup();
    prisma.streamApiKey.findUnique.mockResolvedValue({
      id: 'key-1',
      revokedAt: null,
      expiresAt: new Date(Date.now() - 1000),
      allowedIps: [],
    });
    const req = { headers: { authorization: 'Bearer dlsk_live_x' } };
    await expect(guard.canActivate(contextWith(req))).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a request IP not on the allowlist', async () => {
    const { guard, prisma } = setup();
    prisma.streamApiKey.findUnique.mockResolvedValue({
      id: 'key-1',
      revokedAt: null,
      expiresAt: null,
      allowedIps: ['9.9.9.9'],
    });
    const req = { headers: { authorization: 'Bearer dlsk_live_x' }, ip: '1.1.1.1' };
    await expect(guard.canActivate(contextWith(req))).rejects.toThrow(UnauthorizedException);
  });

  it('accepts a valid key and populates request.streamKey', async () => {
    const { guard, prisma } = setup();
    prisma.streamApiKey.findUnique.mockResolvedValue({
      id: 'key-1',
      organizationId: 'org-1',
      deckId: null,
      scopes: ['MANIFEST_READ'],
      revokedAt: null,
      expiresAt: null,
      allowedIps: [],
    });
    const req: Record<string, unknown> = {
      headers: { authorization: 'Bearer dlsk_live_x' },
      ip: '1.1.1.1',
    };

    const result = await guard.canActivate(contextWith(req));

    expect(result).toBe(true);
    expect(req.streamKey).toEqual({
      id: 'key-1',
      organizationId: 'org-1',
      deckId: null,
      scopes: ['MANIFEST_READ'],
      credentialType: 'stream_key',
    });
  });

  it('accepts a request IP that is on a non-empty allowlist', async () => {
    const { guard, prisma } = setup();
    prisma.streamApiKey.findUnique.mockResolvedValue({
      id: 'key-1',
      organizationId: 'org-1',
      deckId: null,
      scopes: [],
      revokedAt: null,
      expiresAt: null,
      allowedIps: ['1.1.1.1'],
    });
    const req: Record<string, unknown> = {
      headers: { authorization: 'Bearer dlsk_live_x' },
      ip: '1.1.1.1',
    };

    await expect(guard.canActivate(contextWith(req))).resolves.toBe(true);
  });

  it('looks up by the SHA-256 hash of the presented token, never the raw token', async () => {
    const { guard, prisma } = setup();
    prisma.streamApiKey.findUnique.mockResolvedValue(null);
    const presented = 'dlsk_live_abc123';
    const req = { headers: { authorization: `Bearer ${presented}` } };

    await expect(guard.canActivate(contextWith(req))).rejects.toThrow(UnauthorizedException);

    expect(prisma.streamApiKey.findUnique).toHaveBeenCalledWith({
      where: { keyHash: hashToken(presented) },
    });
  });
});

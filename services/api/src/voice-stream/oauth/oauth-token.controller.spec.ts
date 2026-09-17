import { UnauthorizedException } from '@nestjs/common';
import { OAuthTokenController } from './oauth-token.controller';
import { hashToken } from '../../auth/token.util';

function setup() {
  const prisma = { oAuthClient: { findUnique: jest.fn() } };
  const controller = new OAuthTokenController(prisma as never);
  return { controller, prisma };
}

describe('OAuthTokenController.issueToken', () => {
  const originalSecret = process.env.OAUTH_M2M_JWT_SECRET;

  beforeEach(() => {
    process.env.OAUTH_M2M_JWT_SECRET = 'test-secret';
  });

  afterEach(() => {
    process.env.OAUTH_M2M_JWT_SECRET = originalSecret;
  });

  it('rejects an unknown client_id', async () => {
    const { controller, prisma } = setup();
    prisma.oAuthClient.findUnique.mockResolvedValue(null);

    await expect(
      controller.issueToken({
        grant_type: 'client_credentials',
        client_id: 'dlm2m_nope',
        client_secret: 'x',
      }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a revoked client', async () => {
    const { controller, prisma } = setup();
    prisma.oAuthClient.findUnique.mockResolvedValue({
      clientId: 'dlm2m_abc',
      secretHash: hashToken('correct-secret'),
      revokedAt: new Date(),
    });

    await expect(
      controller.issueToken({
        grant_type: 'client_credentials',
        client_id: 'dlm2m_abc',
        client_secret: 'correct-secret',
      }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a wrong client_secret', async () => {
    const { controller, prisma } = setup();
    prisma.oAuthClient.findUnique.mockResolvedValue({
      clientId: 'dlm2m_abc',
      secretHash: hashToken('correct-secret'),
      revokedAt: null,
    });

    await expect(
      controller.issueToken({
        grant_type: 'client_credentials',
        client_id: 'dlm2m_abc',
        client_secret: 'wrong-secret',
      }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('issues a Bearer JWT for correct, active credentials', async () => {
    const { controller, prisma } = setup();
    prisma.oAuthClient.findUnique.mockResolvedValue({
      clientId: 'dlm2m_abc',
      secretHash: hashToken('correct-secret'),
      revokedAt: null,
      organizationId: 'org-1',
      deckId: null,
      scopes: ['MANIFEST_READ'],
    });

    const result = await controller.issueToken({
      grant_type: 'client_credentials',
      client_id: 'dlm2m_abc',
      client_secret: 'correct-secret',
    });

    expect(result.token_type).toBe('Bearer');
    expect(result.access_token.split('.')).toHaveLength(3);
    expect(result.expires_in).toBeGreaterThan(0);
  });
});

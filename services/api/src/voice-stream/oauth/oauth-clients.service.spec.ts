import { NotFoundException } from '@nestjs/common';
import { StreamKeyScope } from '@dialectiva/db';
import { OAuthClientsService } from './oauth-clients.service';

function setup() {
  const prisma = {
    streamDeck: { findUnique: jest.fn() },
    oAuthClient: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };
  const orgActivity = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new OAuthClientsService(prisma as never, orgActivity as never);
  return { service, prisma, orgActivity };
}

describe('OAuthClientsService.create', () => {
  it('creates an org-wide client (no deckId) and returns the plaintext secret once', async () => {
    const { service, prisma, orgActivity } = setup();
    prisma.oAuthClient.create.mockResolvedValue({
      id: 'client-1',
      organizationId: 'org-1',
      deckId: null,
      clientId: 'dlm2m_abc',
      secretHash: 'hash',
      scopes: [StreamKeyScope.MANIFEST_READ],
    });

    const result = await service.create('org-1', 'user-1', {
      scopes: [StreamKeyScope.MANIFEST_READ],
    });

    expect(result.plaintextSecret).toBeTruthy();
    expect(result.clientId).toMatch(/^dlm2m_/);
    expect(prisma.streamDeck.findUnique).not.toHaveBeenCalled();
    expect(orgActivity.record).toHaveBeenCalledWith(
      'org-1',
      'OAUTH_CLIENT_CREATED',
      'user-1',
      expect.objectContaining({ clientId: 'dlm2m_abc' }),
    );
  });

  it('rejects a deckId belonging to another organization', async () => {
    const { service, prisma } = setup();
    prisma.streamDeck.findUnique.mockResolvedValue({ id: 'deck-1', organizationId: 'other-org' });

    await expect(
      service.create('org-1', 'user-1', { deckId: 'deck-1', scopes: [StreamKeyScope.MANIFEST_READ] }),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('OAuthClientsService.revoke', () => {
  it('rejects a client belonging to another organization', async () => {
    const { service, prisma } = setup();
    prisma.oAuthClient.findUnique.mockResolvedValue({ id: 'client-1', organizationId: 'other-org' });

    await expect(service.revoke('org-1', 'client-1', 'user-1')).rejects.toThrow(NotFoundException);
  });

  it('sets revokedAt and records an activity event', async () => {
    const { service, prisma, orgActivity } = setup();
    prisma.oAuthClient.findUnique.mockResolvedValue({
      id: 'client-1',
      organizationId: 'org-1',
      clientId: 'dlm2m_abc',
    });
    prisma.oAuthClient.update.mockResolvedValue({
      id: 'client-1',
      organizationId: 'org-1',
      clientId: 'dlm2m_abc',
      revokedAt: new Date(),
    });

    await service.revoke('org-1', 'client-1', 'user-1');

    expect(prisma.oAuthClient.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'client-1' } }),
    );
    expect(orgActivity.record).toHaveBeenCalledWith(
      'org-1',
      'OAUTH_CLIENT_REVOKED',
      'user-1',
      expect.objectContaining({ clientId: 'dlm2m_abc' }),
    );
  });
});

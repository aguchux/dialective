import { NotFoundException } from '@nestjs/common';
import { StreamKeyScope } from '@dialectiva/db';
import { StreamKeysService } from './stream-keys.service';

function setup() {
  const prisma = {
    streamDeck: { findUnique: jest.fn() },
    streamApiKey: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };
  const service = new StreamKeysService(prisma as never);
  return { service, prisma };
}

describe('StreamKeysService.create', () => {
  it('creates an org-wide key (no deckId) and returns the plaintext key once', async () => {
    const { service, prisma } = setup();
    prisma.streamApiKey.create.mockResolvedValue({
      id: 'key-1',
      organizationId: 'org-1',
      deckId: null,
      keyHash: 'hash',
      keyPrefix: 'dlsk_live_abcdefgh',
      scopes: [StreamKeyScope.MANIFEST_READ],
    });

    const result = await service.create('org-1', 'user-1', {
      scopes: [StreamKeyScope.MANIFEST_READ],
    });

    expect(result.plaintextKey).toMatch(/^dlsk_live_/);
    expect(prisma.streamDeck.findUnique).not.toHaveBeenCalled();
    expect(prisma.streamApiKey.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ organizationId: 'org-1', deckId: null }),
      }),
    );
  });

  it('rejects a deckId belonging to another organization', async () => {
    const { service, prisma } = setup();
    prisma.streamDeck.findUnique.mockResolvedValue({ id: 'deck-1', organizationId: 'other-org' });

    await expect(
      service.create('org-1', 'user-1', { deckId: 'deck-1', scopes: [StreamKeyScope.DECK_READ] }),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.streamApiKey.create).not.toHaveBeenCalled();
  });

  it('accepts a deckId belonging to the caller organization', async () => {
    const { service, prisma } = setup();
    prisma.streamDeck.findUnique.mockResolvedValue({ id: 'deck-1', organizationId: 'org-1' });
    prisma.streamApiKey.create.mockResolvedValue({
      id: 'key-1',
      organizationId: 'org-1',
      deckId: 'deck-1',
    });

    await service.create('org-1', 'user-1', {
      deckId: 'deck-1',
      scopes: [StreamKeyScope.DECK_READ],
    });

    expect(prisma.streamApiKey.create).toHaveBeenCalled();
  });

  it('never returns the same plaintext key across two calls', async () => {
    const { service, prisma } = setup();
    prisma.streamApiKey.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: 'key', ...data }),
    );

    const a = await service.create('org-1', 'user-1', { scopes: [StreamKeyScope.DECK_READ] });
    const b = await service.create('org-1', 'user-1', { scopes: [StreamKeyScope.DECK_READ] });

    expect(a.plaintextKey).not.toBe(b.plaintextKey);
  });
});

describe('StreamKeysService.revoke', () => {
  it('rejects a key belonging to another organization', async () => {
    const { service, prisma } = setup();
    prisma.streamApiKey.findUnique.mockResolvedValue({ id: 'key-1', organizationId: 'other-org' });

    await expect(service.revoke('org-1', 'key-1')).rejects.toThrow(NotFoundException);
    expect(prisma.streamApiKey.update).not.toHaveBeenCalled();
  });

  it('sets revokedAt without deleting the row', async () => {
    const { service, prisma } = setup();
    prisma.streamApiKey.findUnique.mockResolvedValue({ id: 'key-1', organizationId: 'org-1' });
    prisma.streamApiKey.update.mockResolvedValue({ id: 'key-1', revokedAt: new Date() });

    await service.revoke('org-1', 'key-1');

    expect(prisma.streamApiKey.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'key-1' },
        data: expect.objectContaining({ revokedAt: expect.any(Date) }),
      }),
    );
  });
});

describe('StreamKeysService.rotate', () => {
  it('revokes the old key and creates a new one with the same deck/scope/IP config', async () => {
    const { service, prisma } = setup();
    prisma.streamApiKey.findUnique.mockResolvedValue({
      id: 'key-1',
      organizationId: 'org-1',
      deckId: 'deck-1',
      scopes: [StreamKeyScope.AUDIO_STREAM],
      allowedIps: ['1.2.3.4'],
      createdByUserId: 'user-1',
      expiresAt: null,
    });
    prisma.streamApiKey.update.mockResolvedValue({ id: 'key-1', revokedAt: new Date() });
    prisma.streamApiKey.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: 'key-2', ...data }),
    );

    const result = await service.rotate('org-1', 'key-1');

    expect(prisma.streamApiKey.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'key-1' },
        data: expect.objectContaining({ revokedAt: expect.any(Date) }),
      }),
    );
    expect(prisma.streamApiKey.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          deckId: 'deck-1',
          scopes: [StreamKeyScope.AUDIO_STREAM],
          allowedIps: ['1.2.3.4'],
        }),
      }),
    );
    expect(result.plaintextKey).toMatch(/^dlsk_live_/);
  });
});

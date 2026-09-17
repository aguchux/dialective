import { NotFoundException } from '@nestjs/common';
import { StreamManifestService } from './stream-manifest.service';

function setup() {
  const prisma = {
    streamDeck: { findMany: jest.fn(), findUnique: jest.fn() },
    streamDeckItem: { findMany: jest.fn(), findUnique: jest.fn() },
    streamAccessLog: { count: jest.fn(), findMany: jest.fn() },
    isvcCurrent: { findMany: jest.fn().mockResolvedValue([]) },
    streamDeckCurrentVersion: { findUnique: jest.fn().mockResolvedValue(null) },
    streamDeckVersion: { findUnique: jest.fn(), findMany: jest.fn() },
    subscription: { findUnique: jest.fn().mockResolvedValue(null) },
  };
  const catalogue = { getEligibleRecording: jest.fn() };
  const service = new StreamManifestService(prisma as never, catalogue as never);
  return { service, prisma, catalogue };
}

const orgWideKey = { id: 'key-1', organizationId: 'org-1', deckId: null };
const deckScopedKey = { id: 'key-2', organizationId: 'org-1', deckId: 'deck-1' };

describe('StreamManifestService.getDeck', () => {
  it('rejects a deck belonging to another organization', async () => {
    const { service, prisma } = setup();
    prisma.streamDeck.findUnique.mockResolvedValue({ id: 'deck-1', organizationId: 'other-org' });

    await expect(service.getDeck(orgWideKey, 'deck-1')).rejects.toThrow(NotFoundException);
  });

  it('rejects a deck-scoped key reading a different deck in the same org', async () => {
    const { service, prisma } = setup();
    prisma.streamDeck.findUnique.mockResolvedValue({ id: 'deck-2', organizationId: 'org-1' });

    await expect(service.getDeck(deckScopedKey, 'deck-2')).rejects.toThrow(NotFoundException);
    expect(prisma.streamDeck.findUnique).not.toHaveBeenCalled();
  });

  it('allows a deck-scoped key to read its own deck', async () => {
    const { service, prisma } = setup();
    prisma.streamDeck.findUnique.mockResolvedValue({ id: 'deck-1', organizationId: 'org-1' });

    await expect(service.getDeck(deckScopedKey, 'deck-1')).resolves.toEqual(
      expect.objectContaining({ id: 'deck-1' }),
    );
  });
});

describe('StreamManifestService.getEligibleItemMetadata', () => {
  it('resolves the organization plan floor and passes it to getEligibleRecording', async () => {
    const { service, prisma, catalogue } = setup();
    prisma.streamDeck.findUnique.mockResolvedValue({ id: 'deck-1', organizationId: 'org-1' });
    prisma.streamDeckItem.findUnique.mockResolvedValue({ deckId: 'deck-1', recordingId: 'rec-1' });
    prisma.subscription.findUnique.mockResolvedValue({ plan: { minIsvcConfidence: 'VERY_HIGH' } });
    catalogue.getEligibleRecording.mockResolvedValue({ id: 'rec-1' });

    await service.getEligibleItemMetadata(orgWideKey, 'deck-1', 'rec-1');

    expect(catalogue.getEligibleRecording).toHaveBeenCalledWith('rec-1', 'VERY_HIGH');
  });

  it('throws when the recording is gated out by the plan floor (getEligibleRecording returns null)', async () => {
    const { service, prisma, catalogue } = setup();
    prisma.streamDeck.findUnique.mockResolvedValue({ id: 'deck-1', organizationId: 'org-1' });
    prisma.streamDeckItem.findUnique.mockResolvedValue({ deckId: 'deck-1', recordingId: 'rec-1' });
    prisma.subscription.findUnique.mockResolvedValue({ plan: { minIsvcConfidence: 'VERY_HIGH' } });
    catalogue.getEligibleRecording.mockResolvedValue(null);

    await expect(service.getEligibleItemMetadata(orgWideKey, 'deck-1', 'rec-1')).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('StreamManifestService.listEligibleItems', () => {
  it('silently excludes an ineligible (purged) deck item', async () => {
    const { service, prisma, catalogue } = setup();
    prisma.streamDeck.findUnique.mockResolvedValue({ id: 'deck-1', organizationId: 'org-1' });
    prisma.streamDeckItem.findMany.mockResolvedValue([
      { id: 'item-1', recordingId: 'rec-1' },
      { id: 'item-2', recordingId: 'rec-2' },
    ]);
    catalogue.getEligibleRecording.mockImplementation((id: string) =>
      id === 'rec-1' ? Promise.resolve({ id: 'rec-1' }) : Promise.resolve(null),
    );

    const result = await service.listEligibleItems(orgWideKey, 'deck-1');

    expect(result).toHaveLength(1);
    expect(result[0].recording.id).toBe('rec-1');
  });

  it('resolves the organization plan floor and passes it to getEligibleRecording', async () => {
    const { service, prisma, catalogue } = setup();
    prisma.streamDeck.findUnique.mockResolvedValue({ id: 'deck-1', organizationId: 'org-1' });
    prisma.streamDeckItem.findMany.mockResolvedValue([{ id: 'item-1', recordingId: 'rec-1' }]);
    prisma.subscription.findUnique.mockResolvedValue({ plan: { minIsvcConfidence: 'HIGH' } });
    catalogue.getEligibleRecording.mockResolvedValue({ id: 'rec-1' });

    await service.listEligibleItems(orgWideKey, 'deck-1');

    expect(catalogue.getEligibleRecording).toHaveBeenCalledWith('rec-1', 'HIGH');
  });
});

describe('StreamManifestService.getManifest', () => {
  it('returns the live current version number and computes audio_hours from summed durationMs', async () => {
    const { service, prisma, catalogue } = setup();
    prisma.streamDeck.findUnique.mockResolvedValue({
      id: 'deck-1',
      organizationId: 'org-1',
      deckKey: 'DLSD-NG-IGB-NSK-A1B2C3',
    });
    prisma.streamDeckItem.findMany.mockResolvedValue([{ id: 'item-1', recordingId: 'rec-1' }]);
    catalogue.getEligibleRecording.mockResolvedValue({
      id: 'rec-1',
      dialectTag: 'ig',
      durationMs: 3_600_000, // 1 hour
      compositeScore: 90,
      dialectVariant: null,
    });
    prisma.streamDeckCurrentVersion.findUnique.mockResolvedValue({ version: { version: 3 } });

    const manifest = await service.getManifest(orgWideKey, 'deck-1');

    expect(manifest.version).toBe(3);
    expect(manifest.audio_hours).toBe(1);
    expect(manifest.items).toBe(1);
    expect(manifest.records[0]).toMatchObject({
      id: 'rec-1',
      audio_endpoint: '/stream/v1/decks/DLSD-NG-IGB-NSK-A1B2C3/items/rec-1/audio',
    });
    expect(manifest.records[0].audio_endpoint).not.toContain('http');
  });

  it('returns version 0 for a deck with no material version yet', async () => {
    const { service, prisma, catalogue } = setup();
    prisma.streamDeck.findUnique.mockResolvedValue({
      id: 'deck-1',
      organizationId: 'org-1',
      deckKey: 'DLSD-NG-IGB-NSK-A1B2C3',
    });
    prisma.streamDeckItem.findMany.mockResolvedValue([]);
    catalogue.getEligibleRecording.mockResolvedValue(null);
    prisma.streamDeckCurrentVersion.findUnique.mockResolvedValue(null);

    const manifest = await service.getManifest(orgWideKey, 'deck-1');

    expect(manifest.version).toBe(0);
  });

  it('returns the frozen snapshot for a pinned version, even after live membership changed', async () => {
    const { service, prisma } = setup();
    prisma.streamDeck.findUnique.mockResolvedValue({
      id: 'deck-1',
      organizationId: 'org-1',
      deckKey: 'DLSD-NG-IGB-NSK-A1B2C3',
    });
    prisma.streamDeckVersion.findUnique.mockResolvedValue({
      version: 1,
      items: [
        {
          recordingId: 'rec-original',
          durationMs: 1000,
          dialectTag: 'ig',
          subdialectTag: null,
          dlCanonicalScore: '90.00',
          isvs: null,
          isvcVersion: null,
        },
      ],
    });

    const manifest = await service.getManifest(orgWideKey, 'deck-1', 1);

    expect(manifest.version).toBe(1);
    expect(manifest.records).toHaveLength(1);
    expect(manifest.records[0].id).toBe('rec-original');
    expect(prisma.streamDeckItem.findMany).not.toHaveBeenCalled();
  });

  it('404s on an unknown version', async () => {
    const { service, prisma } = setup();
    prisma.streamDeck.findUnique.mockResolvedValue({
      id: 'deck-1',
      organizationId: 'org-1',
      deckKey: 'X',
    });
    prisma.streamDeckVersion.findUnique.mockResolvedValue(null);

    await expect(service.getManifest(orgWideKey, 'deck-1', 99)).rejects.toThrow(NotFoundException);
  });
});

describe('StreamManifestService.getChanges', () => {
  it('returns correct added/removed/updated counts across a version gap', async () => {
    const { service, prisma } = setup();
    prisma.streamDeck.findUnique.mockResolvedValue({
      id: 'deck-1',
      organizationId: 'org-1',
      deckKey: 'X',
    });
    prisma.streamDeckCurrentVersion.findUnique.mockResolvedValue({ version: { version: 3 } });
    prisma.streamDeckVersion.findUnique.mockImplementation(
      ({ where: { deckId_version } }: { where: { deckId_version: { version: number } } }) => {
        if (deckId_version.version === 1) {
          return Promise.resolve({
            version: 1,
            items: [
              {
                recordingId: 'rec-kept',
                durationMs: 1000,
                dialectTag: 'ig',
                subdialectTag: null,
                dlCanonicalScore: '80.00',
                isvs: null,
                isvcVersion: null,
              },
              {
                recordingId: 'rec-removed',
                durationMs: 1000,
                dialectTag: 'ig',
                subdialectTag: null,
                dlCanonicalScore: '80.00',
                isvs: null,
                isvcVersion: null,
              },
            ],
          });
        }
        return Promise.resolve({
          version: 3,
          items: [
            {
              recordingId: 'rec-kept',
              durationMs: 1000,
              dialectTag: 'ig',
              subdialectTag: null,
              dlCanonicalScore: '95.00',
              isvs: null,
              isvcVersion: null,
            },
            {
              recordingId: 'rec-added',
              durationMs: 1000,
              dialectTag: 'ig',
              subdialectTag: null,
              dlCanonicalScore: '80.00',
              isvs: null,
              isvcVersion: null,
            },
          ],
        });
      },
    );

    const changes = await service.getChanges(orgWideKey, 'deck-1', 1);

    expect(changes).toEqual({ from_version: 1, to_version: 3, added: 1, removed: 1, updated: 1 });
  });

  it('404s when afterVersion is not older than the current version', async () => {
    const { service, prisma } = setup();
    prisma.streamDeck.findUnique.mockResolvedValue({
      id: 'deck-1',
      organizationId: 'org-1',
      deckKey: 'X',
    });
    prisma.streamDeckCurrentVersion.findUnique.mockResolvedValue({ version: { version: 3 } });

    await expect(service.getChanges(orgWideKey, 'deck-1', 3)).rejects.toThrow(NotFoundException);
  });
});

describe('StreamManifestService.getEligibleItemMetadata', () => {
  it('404s when the recording is not a member of the deck', async () => {
    const { service, prisma } = setup();
    prisma.streamDeck.findUnique.mockResolvedValue({ id: 'deck-1', organizationId: 'org-1' });
    prisma.streamDeckItem.findUnique.mockResolvedValue(null);

    await expect(service.getEligibleItemMetadata(orgWideKey, 'deck-1', 'rec-1')).rejects.toThrow(
      NotFoundException,
    );
  });
});

import { StreamDeckVersioningService } from './stream-deck-versioning.service';

function setup() {
  const prisma: any = {
    streamDeckItem: { findMany: jest.fn().mockResolvedValue([]) },
    isvcCurrent: { findMany: jest.fn().mockResolvedValue([]) },
    streamDeckCurrentVersion: { findUnique: jest.fn().mockResolvedValue(null), upsert: jest.fn() },
    streamDeckVersion: { create: jest.fn() },
    streamDeck: {
      findUnique: jest.fn().mockResolvedValue({ organizationId: 'org-1', deckKey: 'DLSD-GEN-GEN-GEN-ABCDEF' }),
    },
  };
  prisma.$transaction = jest.fn((cb: (tx: unknown) => unknown) => cb(prisma));
  const catalogue = { getEligibleRecording: jest.fn() };
  const webhookEvents = { emit: jest.fn().mockResolvedValue(undefined) };
  const service = new StreamDeckVersioningService(prisma as never, catalogue as never, webhookEvents as never);
  return { service, prisma, catalogue, webhookEvents };
}

const baseRecording = {
  id: 'rec-1',
  durationMs: 5000,
  dialectTag: 'ig',
  compositeScore: null,
  dialectVariant: null,
};

describe('StreamDeckVersioningService.writeNewVersionIfMaterial', () => {
  it('creates version 1 when no prior version exists', async () => {
    const { prisma, catalogue, service } = setup();
    prisma.streamDeckItem.findMany.mockResolvedValue([{ recordingId: 'rec-1' }]);
    catalogue.getEligibleRecording.mockResolvedValue(baseRecording);
    prisma.streamDeckVersion.create.mockResolvedValue({ id: 'ver-1' });

    await service.writeNewVersionIfMaterial('deck-1', 'manual_add');

    expect(prisma.streamDeckVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ deckId: 'deck-1', version: 1, itemCount: 1 }),
      }),
    );
    expect(prisma.streamDeckCurrentVersion.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { deckId: 'deck-1' },
        update: { versionId: 'ver-1' },
        create: { deckId: 'deck-1', versionId: 'ver-1' },
      }),
    );
  });

  it('is a no-op when membership and fields are unchanged from the current version', async () => {
    const { prisma, catalogue, service } = setup();
    prisma.streamDeckItem.findMany.mockResolvedValue([{ recordingId: 'rec-1' }]);
    catalogue.getEligibleRecording.mockResolvedValue(baseRecording);
    prisma.streamDeckCurrentVersion.findUnique.mockResolvedValue({
      version: {
        version: 3,
        items: [
          {
            recordingId: 'rec-1',
            durationMs: 5000,
            dialectTag: 'ig',
            subdialectTag: null,
            dlCanonicalScore: null,
            isvs: null,
            isvcVersion: null,
          },
        ],
      },
    });

    await service.writeNewVersionIfMaterial('deck-1', 'manual_add');

    expect(prisma.streamDeckVersion.create).not.toHaveBeenCalled();
  });

  it('increments off the existing pointer version when material', async () => {
    const { prisma, catalogue, service } = setup();
    prisma.streamDeckItem.findMany.mockResolvedValue([{ recordingId: 'rec-1' }, { recordingId: 'rec-2' }]);
    catalogue.getEligibleRecording.mockImplementation((id: string) =>
      Promise.resolve({ ...baseRecording, id }),
    );
    prisma.streamDeckCurrentVersion.findUnique.mockResolvedValue({
      version: {
        version: 3,
        items: [
          {
            recordingId: 'rec-1',
            durationMs: 5000,
            dialectTag: 'ig',
            subdialectTag: null,
            dlCanonicalScore: null,
            isvs: null,
            isvcVersion: null,
          },
        ],
      },
    });
    prisma.streamDeckVersion.create.mockResolvedValue({ id: 'ver-4' });

    await service.writeNewVersionIfMaterial('deck-1', 'manual_add');

    expect(prisma.streamDeckVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ version: 4 }) }),
    );
  });

  it('treats a per-item field change (isvs) as material even with identical membership', async () => {
    const { prisma, catalogue, service } = setup();
    prisma.streamDeckItem.findMany.mockResolvedValue([{ recordingId: 'rec-1' }]);
    catalogue.getEligibleRecording.mockResolvedValue(baseRecording);
    prisma.streamDeckCurrentVersion.findUnique.mockResolvedValue({
      version: {
        version: 1,
        items: [
          {
            recordingId: 'rec-1',
            durationMs: 5000,
            dialectTag: 'ig',
            subdialectTag: null,
            dlCanonicalScore: null,
            isvs: '80.00', // was 80, now the fresh snapshot has isvs=null (no IsvcCurrent) -- differs
            isvcVersion: 2,
          },
        ],
      },
    });
    prisma.streamDeckVersion.create.mockResolvedValue({ id: 'ver-2' });

    await service.writeNewVersionIfMaterial('deck-1', 'smart_rule_match');

    expect(prisma.streamDeckVersion.create).toHaveBeenCalled();
  });
});

import { RetentionService } from './retention.service';

function setup() {
  const prisma: any = {
    audioRetentionRule: { findMany: jest.fn() },
    dialect: { findMany: jest.fn().mockResolvedValue([]) },
    wordRecording: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
  };
  const storage = { deleteObject: jest.fn().mockResolvedValue(undefined) };
  const streams = { publish: jest.fn().mockResolvedValue('1-0') };
  const service = new RetentionService(prisma, storage as never, streams as never);
  return { service, prisma, storage, streams };
}

const catchAllRule = {
  id: 'rule-1',
  enabled: true,
  countryId: null,
  dialectTag: null,
  retentionDays: 0,
};

function purgeableWordRecording() {
  return {
    id: 'rec-1',
    dialectTag: 'ig',
    audioBucket: 'bucket',
    audioKey: 'key.wav',
    settledAt: new Date(Date.now() - 100_000),
    refundedAt: null,
  };
}

describe('RetentionService.run -- smart-deck-jobs publish on WordRecording purge', () => {
  it('publishes recording_eligible after purging a WordRecording', async () => {
    const { service, prisma, streams } = setup();
    prisma.audioRetentionRule.findMany.mockResolvedValue([catchAllRule]);
    prisma.wordRecording.findMany.mockResolvedValue([purgeableWordRecording()]);

    await service.run();

    expect(prisma.wordRecording.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'rec-1' },
        data: expect.objectContaining({ audioBucket: null, audioKey: null }),
      }),
    );
    expect(streams.publish).toHaveBeenCalledWith('smart-deck-jobs', {
      trigger: 'recording_eligible',
      recording_id: 'rec-1',
    });
  });

  it('does not fail the purge when the publish itself fails', async () => {
    const { service, prisma, streams } = setup();
    prisma.audioRetentionRule.findMany.mockResolvedValue([catchAllRule]);
    prisma.wordRecording.findMany.mockResolvedValue([purgeableWordRecording()]);
    streams.publish.mockRejectedValue(new Error('redis down'));

    await expect(service.run()).resolves.toBeUndefined();
    expect(prisma.wordRecording.update).toHaveBeenCalled();
  });
});

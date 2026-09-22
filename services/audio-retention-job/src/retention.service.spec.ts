import { RetentionService, resolveRule } from './retention.service';

function setup() {
  const prisma: any = {
    audioRetentionRule: { findMany: jest.fn() },
    dialect: { findMany: jest.fn().mockResolvedValue([]) },
    wordRecording: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
    // VDCL retention exemption: on by default, nothing licensed.
    platformSettings: {
      findFirst: jest.fn().mockResolvedValue({ vdclRetentionExemptionEnabled: true }),
    },
    vdclManifestItem: { findMany: jest.fn().mockResolvedValue([]) },
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

/**
 * A signed VDCL asserts "this manifest covers these clips, verify by hash".
 * If retention can still purge the audio behind a covered clip, the licence
 * goes on asserting coverage of something that no longer exists -- which
 * breaks the one promise the VDCL product rests on. These tests pin that
 * exemption down.
 */
describe('RetentionService.run -- VDCL retention exemption', () => {
  it('does not purge audio covered by an active licence', async () => {
    const { service, prisma, storage } = setup();
    prisma.audioRetentionRule.findMany.mockResolvedValue([catchAllRule]);
    prisma.wordRecording.findMany.mockResolvedValue([purgeableWordRecording()]);
    prisma.vdclManifestItem.findMany.mockResolvedValue([{ recordingId: 'rec-1' }]);

    await service.run();

    // The row is past its retention cutoff and would otherwise be purged.
    expect(storage.deleteObject).not.toHaveBeenCalled();
    expect(prisma.wordRecording.update).not.toHaveBeenCalled();
  });

  it('still purges an unlicensed recording alongside a licensed one', async () => {
    const { service, prisma, storage } = setup();
    prisma.audioRetentionRule.findMany.mockResolvedValue([catchAllRule]);
    prisma.wordRecording.findMany.mockResolvedValue([
      purgeableWordRecording(),
      { ...purgeableWordRecording(), id: 'rec-2' },
    ]);
    prisma.vdclManifestItem.findMany.mockResolvedValue([{ recordingId: 'rec-1' }]);

    await service.run();

    expect(prisma.wordRecording.update).toHaveBeenCalledTimes(1);
    expect(prisma.wordRecording.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'rec-2' } }),
    );
  });

  it('purges licensed audio when an admin turns the exemption off', async () => {
    const { service, prisma } = setup();
    prisma.audioRetentionRule.findMany.mockResolvedValue([catchAllRule]);
    prisma.wordRecording.findMany.mockResolvedValue([purgeableWordRecording()]);
    prisma.platformSettings.findFirst.mockResolvedValue({
      vdclRetentionExemptionEnabled: false,
    });

    await service.run();

    expect(prisma.vdclManifestItem.findMany).not.toHaveBeenCalled();
    expect(prisma.wordRecording.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'rec-1' } }),
    );
  });

  it('keeps the exemption on when the settings row is missing -- fails safe', async () => {
    // Wrongly purging licensed audio is irreversible; wrongly retaining it
    // only costs storage. So an unreadable settings row must not open the gate.
    const { service, prisma, storage } = setup();
    prisma.audioRetentionRule.findMany.mockResolvedValue([catchAllRule]);
    prisma.wordRecording.findMany.mockResolvedValue([purgeableWordRecording()]);
    prisma.platformSettings.findFirst.mockResolvedValue(null);
    prisma.vdclManifestItem.findMany.mockResolvedValue([{ recordingId: 'rec-1' }]);

    await service.run();

    expect(storage.deleteObject).not.toHaveBeenCalled();
  });
});

/**
 * resolveRule is the entire precedence logic of the retention job and had no
 * test at all. Phase 0 is touching the purge path, so pinning it down now
 * keeps a later change from silently widening what gets deleted.
 */
describe('resolveRule precedence', () => {
  const both = { id: 'both', enabled: true, countryId: 'ng', dialectTag: 'ig', retentionDays: 1 };
  const dialectOnly = { id: 'dialect', enabled: true, countryId: null, dialectTag: 'ig', retentionDays: 2 };
  const countryOnly = { id: 'country', enabled: true, countryId: 'ng', dialectTag: null, retentionDays: 3 };
  const catchAll = { id: 'all', enabled: true, countryId: null, dialectTag: null, retentionDays: 4 };

  it('prefers country+dialect over every less specific rule', () => {
    expect(resolveRule([catchAll, countryOnly, dialectOnly, both], 'ig', 'ng')?.id).toBe('both');
  });

  it('prefers dialect-only over country-only and the catch-all', () => {
    expect(resolveRule([catchAll, countryOnly, dialectOnly], 'ig', 'ng')?.id).toBe('dialect');
  });

  it('prefers country-only over the catch-all', () => {
    expect(resolveRule([catchAll, countryOnly], 'ig', 'ng')?.id).toBe('country');
  });

  it('falls back to the catch-all when nothing else matches', () => {
    expect(resolveRule([catchAll], 'ig', 'ng')?.id).toBe('all');
  });

  it('returns null when no rule matches -- never purge is the safe default', () => {
    expect(resolveRule([{ ...dialectOnly, dialectTag: 'yo' }], 'ig', 'ng')).toBeNull();
  });

  it('ignores disabled rules entirely', () => {
    expect(resolveRule([{ ...both, enabled: false }, catchAll], 'ig', 'ng')?.id).toBe('all');
    expect(resolveRule([{ ...catchAll, enabled: false }], 'ig', 'ng')).toBeNull();
  });
});

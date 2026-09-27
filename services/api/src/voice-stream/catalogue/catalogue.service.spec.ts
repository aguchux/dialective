import { StreamRecordKind } from '@dialectiva/db';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { CatalogueService } from './catalogue.service';

function setup() {
  const prisma = {
    wordRecording: {
      count: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    cataloguePreviewLog: { create: jest.fn() },
    vdclManifestItem: { findMany: jest.fn().mockResolvedValue([]) },
    isvcCurrent: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
    },
  };
  const storage = {
    createPresignedDownloadUrl: jest
      .fn()
      .mockResolvedValue({ url: 'https://signed-url', expiresInSeconds: 900 }),
  };
  // VDCL rights check -- allowed by default here so the existing catalogue
  // assertions stay about catalogue behaviour; the licence-denial case has
  // its own test below.
  const rights = {
    mayUse: jest.fn().mockResolvedValue({ allowed: true, entitlementDecision: 'allowed' }),
    recordDecision: jest.fn().mockResolvedValue(undefined),
  };
  // The coverage filter is OFF by default, matching the production default,
  // so every existing assertion here stays about catalogue behaviour rather
  // than VDCL. The filter has its own tests below.
  const settings = {
    isVdclCatalogueCoverageFilterEnabled: jest.fn().mockResolvedValue(false),
  };
  const service = new CatalogueService(
    prisma as any,
    storage as any,
    rights as any,
    settings as any,
  );
  return { prisma, storage, rights, settings, service };
}

describe('CatalogueService', () => {
  describe('search', () => {
    it('only queries SETTLED recordings with audio still present', async () => {
      const { prisma, service } = setup();
      prisma.wordRecording.count.mockResolvedValue(0);
      prisma.wordRecording.findMany.mockResolvedValue([]);

      await service.search({ page: 1, pageSize: 20 });

      expect(prisma.wordRecording.count).toHaveBeenCalledWith({
        where: expect.objectContaining({
          status: 'SETTLED',
          audioBucket: { not: null },
          audioKey: { not: null },
          audioDeletedAt: null,
        }),
      });
    });

    it('applies dialect and minScore filters', async () => {
      const { prisma, service } = setup();
      prisma.wordRecording.count.mockResolvedValue(0);
      prisma.wordRecording.findMany.mockResolvedValue([]);

      await service.search({ dialectTag: 'igbo-nsukka', minScore: 90, page: 1, pageSize: 20 });

      expect(prisma.wordRecording.count).toHaveBeenCalledWith({
        where: expect.objectContaining({
          dialectTag: 'igbo-nsukka',
          score: { gte: 90 },
        }),
      });
    });

    it('narrows to recordings with a matching current ISVC when minIsvs/minConfidence are set', async () => {
      const { prisma, service } = setup();
      prisma.isvcCurrent.findMany.mockResolvedValue([
        {
          recordingId: 'rec-1',
          aggregation: { isvs: 92, confidence: 'HIGH', organizationCount: 6, agreement: 85 },
        },
        {
          recordingId: 'rec-2',
          aggregation: { isvs: 60, confidence: 'EMERGING', organizationCount: 2, agreement: 50 },
        },
      ]);
      prisma.wordRecording.count.mockResolvedValue(0);
      prisma.wordRecording.findMany.mockResolvedValue([]);

      await service.search({ minIsvs: 90, page: 1, pageSize: 20 });

      expect(prisma.wordRecording.count).toHaveBeenCalledWith({
        where: expect.objectContaining({ id: { in: ['rec-1'] } }),
      });
    });

    it('returns an empty page without querying WordRecording when no recording meets the ISVC filter', async () => {
      const { prisma, service } = setup();
      prisma.isvcCurrent.findMany.mockResolvedValue([
        {
          recordingId: 'rec-1',
          aggregation: { isvs: 40, confidence: 'EMERGING', organizationCount: 1, agreement: 100 },
        },
      ]);

      const result = await service.search({ minIsvs: 90, page: 1, pageSize: 20 });

      expect(result).toEqual({ items: [], page: 1, pageSize: 20, total: 0, totalPages: 1 });
      expect(prisma.wordRecording.count).not.toHaveBeenCalled();
      expect(prisma.wordRecording.findMany).not.toHaveBeenCalled();
    });

    it('enriches results with the current ISVC fields when one exists for a recording', async () => {
      const { prisma, service } = setup();
      prisma.wordRecording.count.mockResolvedValue(1);
      prisma.wordRecording.findMany.mockResolvedValue([
        {
          id: 'rec-1',
          dialectTag: 'igbo',
          durationMs: 4000,
          score: 90,
          rawScore: 90,
          compositeScore: 90,
          noiseScore: 10,
          qualityScore: 95,
          livenessScore: 99,
          createdAt: new Date('2026-01-01'),
          dialectVariant: null,
        },
      ]);
      prisma.isvcCurrent.findMany.mockResolvedValueOnce([
        {
          recordingId: 'rec-1',
          aggregation: { isvs: 94, confidence: 'VERY_HIGH', organizationCount: 12, agreement: 96 },
        },
      ]);

      const result = await service.search({ page: 1, pageSize: 20 });

      expect(result.items[0]).toEqual(
        expect.objectContaining({
          isvs: 94,
          isvcConfidence: 'VERY_HIGH',
          isvcOrganizationCount: 12,
          isvcAgreement: 96,
        }),
      );
    });

    it('leaves ISVC fields null for a recording with no ISVC yet', async () => {
      const { prisma, service } = setup();
      prisma.wordRecording.count.mockResolvedValue(1);
      prisma.wordRecording.findMany.mockResolvedValue([
        {
          id: 'rec-1',
          dialectTag: 'igbo',
          durationMs: 4000,
          score: 90,
          rawScore: 90,
          compositeScore: 90,
          noiseScore: 10,
          qualityScore: 95,
          livenessScore: 99,
          createdAt: new Date('2026-01-01'),
          dialectVariant: null,
        },
      ]);

      const result = await service.search({ page: 1, pageSize: 20 });

      expect(result.items[0]).toEqual(
        expect.objectContaining({
          isvs: null,
          isvcConfidence: null,
          isvcOrganizationCount: null,
          isvcAgreement: null,
        }),
      );
    });

    it('classifies qualityTier as premium_verified only at VERY_HIGH confidence with enough orgs', async () => {
      const { prisma, service } = setup();
      prisma.wordRecording.count.mockResolvedValue(1);
      const row = (id: string) => ({
        id,
        dialectTag: 'igbo',
        durationMs: 1000,
        score: 90,
        rawScore: 90,
        compositeScore: 90,
        noiseScore: 10,
        qualityScore: 95,
        livenessScore: 99,
        createdAt: new Date('2026-01-01'),
        dialectVariant: null,
      });
      prisma.wordRecording.findMany.mockResolvedValue([row('rec-1')]);
      prisma.isvcCurrent.findMany.mockResolvedValueOnce([
        {
          recordingId: 'rec-1',
          aggregation: { isvs: 98, confidence: 'VERY_HIGH', organizationCount: 2, agreement: 96 },
        },
      ]);

      const result = await service.search({ page: 1, pageSize: 20 });

      expect(result.items[0].qualityTier).toBe('standard');
    });

    it('takes the stricter of a user minConfidence filter and planMinConfidence', async () => {
      const { prisma, service } = setup();
      prisma.wordRecording.count.mockResolvedValue(0);
      prisma.wordRecording.findMany.mockResolvedValue([]);
      prisma.isvcCurrent.findMany.mockResolvedValue([
        {
          recordingId: 'rec-1',
          aggregation: { isvs: 92, confidence: 'HIGH', organizationCount: 6, agreement: 85 },
        },
        {
          recordingId: 'rec-2',
          aggregation: { isvs: 96, confidence: 'VERY_HIGH', organizationCount: 6, agreement: 85 },
        },
      ]);

      await service.search({
        minConfidence: 'ESTABLISHED',
        planMinConfidence: 'VERY_HIGH',
        page: 1,
        pageSize: 20,
      });

      expect(prisma.wordRecording.count).toHaveBeenCalledWith({
        where: expect.objectContaining({ id: { in: ['rec-2'] } }),
      });
    });

    it('sortBy=isvs_desc orders and paginates by ISVS instead of createdAt', async () => {
      const { prisma, service } = setup();
      prisma.isvcCurrent.findMany.mockResolvedValue([
        {
          recordingId: 'rec-low',
          aggregation: { isvs: 60, confidence: 'ESTABLISHED', organizationCount: 2, agreement: 80 },
        },
        {
          recordingId: 'rec-high',
          aggregation: { isvs: 95, confidence: 'VERY_HIGH', organizationCount: 5, agreement: 90 },
        },
      ]);
      prisma.wordRecording.findMany.mockResolvedValue([
        {
          id: 'rec-high',
          dialectTag: 'igbo',
          durationMs: 1000,
          score: 90,
          rawScore: 90,
          compositeScore: 90,
          noiseScore: 10,
          qualityScore: 95,
          livenessScore: 99,
          createdAt: new Date('2026-01-01'),
          dialectVariant: null,
        },
        {
          id: 'rec-low',
          dialectTag: 'igbo',
          durationMs: 1000,
          score: 90,
          rawScore: 90,
          compositeScore: 90,
          noiseScore: 10,
          qualityScore: 95,
          livenessScore: 99,
          createdAt: new Date('2026-01-02'),
          dialectVariant: null,
        },
      ]);

      const result = await service.search({ sortBy: 'isvs_desc', page: 1, pageSize: 20 });

      expect(result.items.map((i) => i.recordingId)).toEqual(['rec-high', 'rec-low']);
      expect(result.total).toBe(2);
    });

    it('sortBy=isvs_desc slices the correct page window without dropping or duplicating items', async () => {
      const { prisma, service } = setup();
      prisma.isvcCurrent.findMany.mockResolvedValue([
        {
          recordingId: 'rec-a',
          aggregation: { isvs: 90, confidence: 'HIGH', organizationCount: 2, agreement: 80 },
        },
        {
          recordingId: 'rec-b',
          aggregation: { isvs: 80, confidence: 'HIGH', organizationCount: 2, agreement: 80 },
        },
        {
          recordingId: 'rec-c',
          aggregation: { isvs: 70, confidence: 'HIGH', organizationCount: 2, agreement: 80 },
        },
      ]);
      prisma.wordRecording.findMany.mockImplementation(
        ({ where }: { where: { id: { in: string[] } } }) =>
          Promise.resolve(
            where.id.in.map((id) => ({
              id,
              dialectTag: 'igbo',
              durationMs: 1000,
              score: 90,
              rawScore: 90,
              compositeScore: 90,
              noiseScore: 10,
              qualityScore: 95,
              livenessScore: 99,
              createdAt: new Date('2026-01-01'),
              dialectVariant: null,
            })),
          ),
      );

      const result = await service.search({ sortBy: 'isvs_desc', page: 2, pageSize: 2 });

      expect(result.items.map((i) => i.recordingId)).toEqual(['rec-c']);
      expect(result.total).toBe(3);
      expect(result.totalPages).toBe(2);
    });
  });

  describe('preview', () => {
    it('throws when the recording is not eligible (missing audio or not found)', async () => {
      const { prisma, service } = setup();
      prisma.wordRecording.findFirst.mockResolvedValue(null);

      await expect(service.preview('org-1', 'user-1', 'rec-1')).rejects.toThrow(NotFoundException);
      expect(prisma.cataloguePreviewLog.create).not.toHaveBeenCalled();
    });

    it('logs the preview access and returns a short-lived signed URL', async () => {
      const { prisma, storage, service } = setup();
      prisma.wordRecording.findFirst.mockResolvedValue({
        audioBucket: 'bucket',
        audioKey: 'key.wav',
      });

      const result = await service.preview('org-1', 'user-1', 'rec-1');

      expect(prisma.cataloguePreviewLog.create).toHaveBeenCalledWith({
        data: { organizationId: 'org-1', userId: 'user-1', recordingId: 'rec-1' },
      });
      expect(storage.createPresignedDownloadUrl).toHaveBeenCalledWith('bucket', 'key.wav');
      expect(result).toEqual({ url: 'https://signed-url', expiresInSeconds: 900 });
    });

    it('refuses to hand out a signed URL for a recording with no active licence', async () => {
      // This route is the second way audio leaves for a subscriber -- it
      // returns a presigned Spaces URL directly, bypassing the stream API's
      // guard chain and metering entirely. A VDCL check wired only into the
      // streaming chokepoint would therefore be trivially sidesteppable.
      const { prisma, storage, rights, service } = setup();
      prisma.wordRecording.findFirst.mockResolvedValue({
        audioBucket: 'bucket',
        audioKey: 'key.wav',
      });
      rights.mayUse.mockResolvedValue({
        allowed: false,
        reason: 'no_vdcl',
        entitlementDecision: 'denied:no_vdcl',
      });

      await expect(service.preview('org-1', 'user-1', 'rec-1')).rejects.toThrow(
        ForbiddenException,
      );
      expect(storage.createPresignedDownloadUrl).not.toHaveBeenCalled();
      expect(prisma.cataloguePreviewLog.create).not.toHaveBeenCalled();
      expect(rights.recordDecision).toHaveBeenCalled();
    });

    it('rejects a recording below the plan confidence floor even though it is otherwise eligible', async () => {
      const { prisma, service } = setup();
      prisma.wordRecording.findFirst.mockResolvedValue({
        audioBucket: 'bucket',
        audioKey: 'key.wav',
      });
      prisma.isvcCurrent.findUnique.mockResolvedValue({
        aggregation: { confidence: 'ESTABLISHED' },
      });

      await expect(service.preview('org-1', 'user-1', 'rec-1', 'HIGH')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.cataloguePreviewLog.create).not.toHaveBeenCalled();
    });
  });

  describe('getEligibleRecording', () => {
    const recordingRow = {
      id: 'rec-1',
      dialectTag: 'igbo',
      durationMs: 1000,
      compositeScore: 90,
      audioBucket: 'bucket',
      audioKey: 'key.wav',
      dialectVariant: null,
    };

    it('returns the recording when no plan floor is given', async () => {
      const { prisma, service } = setup();
      prisma.wordRecording.findFirst.mockResolvedValue(recordingRow);

      const result = await service.getEligibleRecording(StreamRecordKind.WORD_RECORDING, 'rec-1');

      expect(result).toEqual(recordingRow);
    });

    it('returns null when the recording is below the plan confidence floor', async () => {
      const { prisma, service } = setup();
      prisma.wordRecording.findFirst.mockResolvedValue(recordingRow);
      prisma.isvcCurrent.findUnique.mockResolvedValue({
        aggregation: { confidence: 'ESTABLISHED' },
      });

      const result = await service.getEligibleRecording(StreamRecordKind.WORD_RECORDING, 'rec-1', 'VERY_HIGH');

      expect(result).toBeNull();
    });

    it('returns null for a recording with no ISVC yet when a plan floor is set', async () => {
      const { prisma, service } = setup();
      prisma.wordRecording.findFirst.mockResolvedValue(recordingRow);
      prisma.isvcCurrent.findUnique.mockResolvedValue(null);

      const result = await service.getEligibleRecording(StreamRecordKind.WORD_RECORDING, 'rec-1', 'HIGH');

      expect(result).toBeNull();
    });

    it('returns the recording when its confidence meets the plan floor', async () => {
      const { prisma, service } = setup();
      prisma.wordRecording.findFirst.mockResolvedValue(recordingRow);
      prisma.isvcCurrent.findUnique.mockResolvedValue({
        aggregation: { confidence: 'VERY_HIGH' },
      });

      const result = await service.getEligibleRecording(StreamRecordKind.WORD_RECORDING, 'rec-1', 'HIGH');

      expect(result).toEqual(recordingRow);
    });
  });

  describe('isEligible', () => {
    it('returns true only when a matching SETTLED, un-purged recording exists', async () => {
      const { prisma, service } = setup();
      prisma.wordRecording.count.mockResolvedValue(1);

      const result = await service.isEligible(StreamRecordKind.WORD_RECORDING, 'rec-1');

      expect(result).toBe(true);
      expect(prisma.wordRecording.count).toHaveBeenCalledWith({
        where: expect.objectContaining({ id: 'rec-1', status: 'SETTLED' }),
      });
    });

    it('returns false when no matching recording exists', async () => {
      const { prisma, service } = setup();
      prisma.wordRecording.count.mockResolvedValue(0);

      const result = await service.isEligible(StreamRecordKind.WORD_RECORDING, 'rec-missing');

      expect(result).toBe(false);
    });
  });

  describe('VDCL coverage filter', () => {
    it('is NOT driven by vdclEnforcementEnabled', async () => {
      // Guards a real near-miss: vdclEnforcementEnabled is already true in
      // production, where it denies AUDIO for an uncovered recording while the
      // catalogue stays whole. Wiring the listing filter to it would have cut
      // the subscriber catalogue from ~191,800 recordings to the handful
      // covered by a manifest. If someone "simplifies" these back to one flag,
      // this fails.
      const { prisma, settings, service } = setup();
      (settings as unknown as Record<string, jest.Mock>).isVdclEnforcementEnabled = jest
        .fn()
        .mockResolvedValue(true);
      settings.isVdclCatalogueCoverageFilterEnabled.mockResolvedValue(false);
      prisma.wordRecording.count.mockResolvedValue(0);
      prisma.wordRecording.findMany.mockResolvedValue([]);

      await service.search({ page: 1, pageSize: 20 });

      expect(prisma.vdclManifestItem.findMany).not.toHaveBeenCalled();
      expect(prisma.wordRecording.count.mock.calls[0][0].where.AND).toBeUndefined();
    });

    it('does not filter while enforcement is off', async () => {
      // The production default. Listing behaviour must be untouched, and the
      // manifest table must not even be read.
      const { prisma, service } = setup();
      prisma.wordRecording.count.mockResolvedValue(0);
      prisma.wordRecording.findMany.mockResolvedValue([]);

      await service.search({ page: 1, pageSize: 20 });

      expect(prisma.vdclManifestItem.findMany).not.toHaveBeenCalled();
      expect(prisma.wordRecording.count.mock.calls[0][0].where.AND).toBeUndefined();
    });

    it('narrows search to recordings covered by a manifest when enforcement is on', async () => {
      const { prisma, settings, service } = setup();
      settings.isVdclCatalogueCoverageFilterEnabled.mockResolvedValue(true);
      prisma.vdclManifestItem.findMany.mockResolvedValue([
        { recordingId: 'licensed-1' },
        { recordingId: 'licensed-2' },
      ]);
      prisma.wordRecording.count.mockResolvedValue(0);
      prisma.wordRecording.findMany.mockResolvedValue([]);

      await service.search({ page: 1, pageSize: 20 });

      expect(prisma.wordRecording.count.mock.calls[0][0].where.AND).toEqual([
        { id: { in: ['licensed-1', 'licensed-2'] } },
      ]);
    });

    it('scopes covered ids BY KIND, so one dataset cannot vouch for another', async () => {
      // WordRecording and DomainConversationRecording have independent uuid
      // spaces. Pooling covered ids would let a licensed conversation satisfy
      // the coverage check for an unlicensed word recording sharing its uuid --
      // a filter answering about the wrong dataset.
      const { prisma, settings, service } = setup();
      settings.isVdclCatalogueCoverageFilterEnabled.mockResolvedValue(true);
      prisma.vdclManifestItem.findMany.mockResolvedValue([]);
      prisma.wordRecording.count.mockResolvedValue(0);
      prisma.wordRecording.findMany.mockResolvedValue([]);

      await service.search({ page: 1, pageSize: 20 });

      expect(prisma.vdclManifestItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { recordKind: 'WORD_RECORDING' } }),
      );
    });

    it('keeps the coverage filter when an ISVC filter also sets where.id', async () => {
      // The regression this composition exists for: the ISVC branch assigns
      // where.id outright, so a coverage filter written the same way would be
      // silently replaced and widen results back to unlicensed recordings.
      const { prisma, settings, service } = setup();
      settings.isVdclCatalogueCoverageFilterEnabled.mockResolvedValue(true);
      prisma.vdclManifestItem.findMany.mockResolvedValue([{ recordingId: 'licensed-1' }]);
      prisma.isvcCurrent.findMany.mockResolvedValue([
        { recordingId: 'licensed-1', aggregation: { isvs: 90, confidence: 'HIGH', organizationCount: 3 } },
      ]);
      prisma.wordRecording.count.mockResolvedValue(0);
      prisma.wordRecording.findMany.mockResolvedValue([]);

      await service.search({ page: 1, pageSize: 20, minIsvs: 50 });

      const where = prisma.wordRecording.count.mock.calls[0][0].where;
      // Both survive: the ISVC set on `id`, the coverage set under AND.
      expect(where.id).toBeDefined();
      expect(where.AND).toEqual([{ id: { in: ['licensed-1'] } }]);
    });

    it('404s a preview for a recording outside every manifest', async () => {
      // Rather than reaching the rights check and returning a 403, which
      // would confirm the clip exists.
      const { prisma, settings, service } = setup();
      settings.isVdclCatalogueCoverageFilterEnabled.mockResolvedValue(true);
      prisma.vdclManifestItem.findMany.mockResolvedValue([]);
      prisma.wordRecording.findFirst.mockResolvedValue(null);

      await expect(service.preview('org-1', 'user-1', 'unlicensed-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('blocks an unlicensed recording from being hand-added to a deck', async () => {
      // Otherwise the search filter would only be a display convention: an
      // org that learned an id elsewhere could still add it.
      const { prisma, settings, service } = setup();
      settings.isVdclCatalogueCoverageFilterEnabled.mockResolvedValue(true);
      prisma.vdclManifestItem.findMany.mockResolvedValue([]);
      prisma.wordRecording.count.mockResolvedValue(0);

      await expect(service.isEligible(StreamRecordKind.WORD_RECORDING, 'unlicensed-1')).resolves.toBe(false);
      expect(prisma.wordRecording.count.mock.calls[0][0].where.id).toEqual({ in: [] });
    });
  });
});

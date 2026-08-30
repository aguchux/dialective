import { NotFoundException } from '@nestjs/common';
import { CatalogueService } from './catalogue.service';

function setup() {
  const prisma = {
    wordRecording: {
      count: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    cataloguePreviewLog: { create: jest.fn() },
    isvcCurrent: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const storage = {
    createPresignedDownloadUrl: jest
      .fn()
      .mockResolvedValue({ url: 'https://signed-url', expiresInSeconds: 900 }),
  };
  const service = new CatalogueService(prisma as any, storage as any);
  return { prisma, storage, service };
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
  });

  describe('preview', () => {
    it('throws when the recording is not eligible (missing audio or not found)', async () => {
      const { prisma, service } = setup();
      prisma.wordRecording.findFirst.mockResolvedValue(null);

      await expect(service.preview('org-1', 'user-1', 'rec-1')).rejects.toThrow(
        NotFoundException,
      );
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
  });

  describe('isEligible', () => {
    it('returns true only when a matching SETTLED, un-purged recording exists', async () => {
      const { prisma, service } = setup();
      prisma.wordRecording.count.mockResolvedValue(1);

      const result = await service.isEligible('rec-1');

      expect(result).toBe(true);
      expect(prisma.wordRecording.count).toHaveBeenCalledWith({
        where: expect.objectContaining({ id: 'rec-1', status: 'SETTLED' }),
      });
    });

    it('returns false when no matching recording exists', async () => {
      const { prisma, service } = setup();
      prisma.wordRecording.count.mockResolvedValue(0);

      const result = await service.isEligible('rec-missing');

      expect(result).toBe(false);
    });
  });
});

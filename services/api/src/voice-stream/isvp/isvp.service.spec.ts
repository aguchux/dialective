import { NotFoundException } from '@nestjs/common';
import { IsvpService } from './isvp.service';

function setup() {
  const prisma = {
    subscriberValidation: {
      upsert: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
  };
  const streams = { publish: jest.fn().mockResolvedValue('1-0') };
  const catalogue = { isEligible: jest.fn().mockResolvedValue(true) };
  const webhookEvents = { emit: jest.fn().mockResolvedValue(undefined) };
  const service = new IsvpService(prisma as any, streams as any, catalogue as any, webhookEvents as any);
  return { prisma, streams, catalogue, webhookEvents, service };
}

const DTO = {
  transcriptAccuracy: 90,
  pronunciationAccuracy: 88,
  dialectAuthenticity: 92,
  speechClarity: 91,
  audioQuality: 85,
  overallScore: 90,
};

describe('IsvpService', () => {
  describe('submit', () => {
    it('rejects a recording that is not eligible for Voice Stream', async () => {
      const { catalogue, prisma, service } = setup();
      catalogue.isEligible.mockResolvedValue(false);

      await expect(service.submit('org-1', 'user-1', 'rec-1', DTO as any)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.subscriberValidation.upsert).not.toHaveBeenCalled();
    });

    it('upserts on the (organizationId, userId, recordingId) key', async () => {
      const { prisma, service } = setup();
      prisma.subscriberValidation.upsert.mockResolvedValue({ id: 'val-1' });

      await service.submit('org-1', 'user-1', 'rec-1', DTO as any);

      expect(prisma.subscriberValidation.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            organizationId_userId_recordingId: {
              organizationId: 'org-1',
              userId: 'user-1',
              recordingId: 'rec-1',
            },
          },
        }),
      );
    });

    it('publishes a recording_id to isvc-jobs on success', async () => {
      const { prisma, streams, service } = setup();
      prisma.subscriberValidation.upsert.mockResolvedValue({ id: 'val-1' });

      await service.submit('org-1', 'user-1', 'rec-1', DTO as any);

      expect(streams.publish).toHaveBeenCalledWith('isvc-jobs', { recording_id: 'rec-1' });
    });

    it('does not throw when publishing to isvc-jobs fails (best-effort)', async () => {
      const { prisma, streams, service } = setup();
      prisma.subscriberValidation.upsert.mockResolvedValue({ id: 'val-1' });
      streams.publish.mockRejectedValue(new Error('redis down'));

      await expect(service.submit('org-1', 'user-1', 'rec-1', DTO as any)).resolves.toEqual({
        id: 'val-1',
      });
    });
  });

  describe('listMine', () => {
    it('scopes to the organization, optionally filtered by recordingId', async () => {
      const { prisma, service } = setup();
      prisma.subscriberValidation.findMany.mockResolvedValue([]);

      await service.listMine('org-1', 'rec-1');

      expect(prisma.subscriberValidation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: 'org-1', recordingId: 'rec-1' } }),
      );
    });
  });

  describe('getOrgContribution', () => {
    it('returns distinct recordings validated and total validation count', async () => {
      const { prisma, service } = setup();
      prisma.subscriberValidation.findMany.mockResolvedValue([
        { recordingId: 'rec-1' },
        { recordingId: 'rec-2' },
      ]);
      prisma.subscriberValidation.count.mockResolvedValue(5);

      const result = await service.getOrgContribution('org-1');

      expect(result).toEqual({ recordingsValidated: 2, totalValidations: 5 });
    });
  });
});

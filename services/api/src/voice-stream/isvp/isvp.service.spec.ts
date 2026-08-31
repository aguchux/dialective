import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { IsvpService } from './isvp.service';

function setup() {
  const prisma = {
    subscriberValidation: {
      upsert: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    validationAuditLog: {
      create: jest.fn().mockResolvedValue({}),
      findMany: jest.fn(),
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

    it('upserts on the (organizationId, userId, recordingId) key, starting PENDING', async () => {
      const { prisma, service } = setup();
      prisma.subscriberValidation.findUnique.mockResolvedValue(null);
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
          update: expect.objectContaining({ status: 'PENDING', reviewedByUserId: null }),
        }),
      );
    });

    it('does NOT publish to isvc-jobs on submit -- only approval should trigger recalculation', async () => {
      const { prisma, streams, service } = setup();
      prisma.subscriberValidation.findUnique.mockResolvedValue(null);
      prisma.subscriberValidation.upsert.mockResolvedValue({ id: 'val-1' });

      await service.submit('org-1', 'user-1', 'rec-1', DTO as any);

      expect(streams.publish).not.toHaveBeenCalled();
    });

    it('logs SUBMITTED for a first-time validation and RESUBMITTED for a resubmission', async () => {
      const { prisma, service } = setup();
      prisma.subscriberValidation.findUnique.mockResolvedValue(null);
      prisma.subscriberValidation.upsert.mockResolvedValue({ id: 'val-1' });
      await service.submit('org-1', 'user-1', 'rec-1', DTO as any);
      expect(prisma.validationAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ action: 'SUBMITTED' }) }),
      );

      prisma.subscriberValidation.findUnique.mockResolvedValue({ id: 'val-1' });
      await service.submit('org-1', 'user-1', 'rec-1', DTO as any);
      expect(prisma.validationAuditLog.create).toHaveBeenLastCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ action: 'RESUBMITTED' }) }),
      );
    });

    it('resets an already-APPROVED validation back to PENDING on resubmission', async () => {
      const { prisma, service } = setup();
      prisma.subscriberValidation.findUnique.mockResolvedValue({ id: 'val-1' });
      prisma.subscriberValidation.upsert.mockResolvedValue({ id: 'val-1' });

      await service.submit('org-1', 'user-1', 'rec-1', DTO as any);

      expect(prisma.subscriberValidation.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            status: 'PENDING',
            reviewedByUserId: null,
            reviewedAt: null,
            rejectionReason: null,
          }),
        }),
      );
    });
  });

  describe('approve', () => {
    it('rejects reviewing your own validation', async () => {
      const { prisma, service } = setup();
      prisma.subscriberValidation.findUnique.mockResolvedValue({
        id: 'val-1',
        organizationId: 'org-1',
        userId: 'user-1',
        status: 'PENDING',
      });

      await expect(service.approve('org-1', 'user-1', 'val-1')).rejects.toThrow(ForbiddenException);
    });

    it('404s when the validation belongs to a different organization', async () => {
      const { prisma, service } = setup();
      prisma.subscriberValidation.findUnique.mockResolvedValue({
        id: 'val-1',
        organizationId: 'org-OTHER',
        userId: 'user-2',
        status: 'PENDING',
      });

      await expect(service.approve('org-1', 'reviewer-1', 'val-1')).rejects.toThrow(NotFoundException);
    });

    it('marks APPROVED, records the reviewer, and publishes to isvc-jobs', async () => {
      const { prisma, streams, service } = setup();
      prisma.subscriberValidation.findUnique.mockResolvedValue({
        id: 'val-1',
        organizationId: 'org-1',
        userId: 'user-2',
        recordingId: 'rec-1',
        status: 'PENDING',
      });
      prisma.subscriberValidation.update.mockResolvedValue({ id: 'val-1', status: 'APPROVED' });

      await service.approve('org-1', 'reviewer-1', 'val-1');

      expect(prisma.subscriberValidation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'val-1' },
          data: expect.objectContaining({ status: 'APPROVED', reviewedByUserId: 'reviewer-1' }),
        }),
      );
      expect(streams.publish).toHaveBeenCalledWith('isvc-jobs', { recording_id: 'rec-1' });
      expect(prisma.validationAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ action: 'APPROVED' }) }),
      );
    });
  });

  describe('reject', () => {
    it('marks REJECTED with a reason and does not publish when it was already PENDING', async () => {
      const { prisma, streams, service } = setup();
      prisma.subscriberValidation.findUnique.mockResolvedValue({
        id: 'val-1',
        organizationId: 'org-1',
        userId: 'user-2',
        recordingId: 'rec-1',
        status: 'PENDING',
      });
      prisma.subscriberValidation.update.mockResolvedValue({ id: 'val-1', status: 'REJECTED' });

      await service.reject('org-1', 'reviewer-1', 'val-1', { reason: 'Score does not match audio' });

      expect(prisma.subscriberValidation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'REJECTED',
            rejectionReason: 'Score does not match audio',
          }),
        }),
      );
      expect(streams.publish).not.toHaveBeenCalled();
    });

    it('republishes to isvc-jobs when reverting a previously-APPROVED validation', async () => {
      const { prisma, streams, service } = setup();
      prisma.subscriberValidation.findUnique.mockResolvedValue({
        id: 'val-1',
        organizationId: 'org-1',
        userId: 'user-2',
        recordingId: 'rec-1',
        status: 'APPROVED',
      });
      prisma.subscriberValidation.update.mockResolvedValue({ id: 'val-1', status: 'REJECTED' });

      await service.reject('org-1', 'reviewer-1', 'val-1', { reason: 'Retracting after audit' });

      expect(streams.publish).toHaveBeenCalledWith('isvc-jobs', { recording_id: 'rec-1' });
    });
  });

  describe('listQueue', () => {
    it('scopes to the organization and only PENDING validations', async () => {
      const { prisma, service } = setup();
      prisma.subscriberValidation.findMany.mockResolvedValue([]);

      await service.listQueue('org-1');

      expect(prisma.subscriberValidation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: 'org-1', status: 'PENDING' } }),
      );
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
    it('only counts APPROVED validations', async () => {
      const { prisma, service } = setup();
      prisma.subscriberValidation.findMany.mockResolvedValue([{ recordingId: 'rec-1' }, { recordingId: 'rec-2' }]);
      prisma.subscriberValidation.count.mockResolvedValue(5);

      const result = await service.getOrgContribution('org-1');

      expect(prisma.subscriberValidation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: 'org-1', status: 'APPROVED' } }),
      );
      expect(prisma.subscriberValidation.count).toHaveBeenCalledWith({
        where: { organizationId: 'org-1', status: 'APPROVED' },
      });
      expect(result).toEqual({ recordingsValidated: 2, totalValidations: 5 });
    });
  });
});

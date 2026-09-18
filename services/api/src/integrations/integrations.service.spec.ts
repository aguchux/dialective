import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@dialectiva/db';
import { IntegrationsService } from './integrations.service';
import { INTEGRATION_REGISTRY } from './integration-registry';

describe('IntegrationsService', () => {
  const userId = 'user-1';
  const integration = {
    id: 'integration-1',
    slug: 'whatsapp-validator',
    name: 'WhatsApp Validator',
    description: "Peer-verify a member's WhatsApp number.",
    category: 'Verification',
    iconKey: 'MessageCircle',
    enabled: true,
    feeTokenAmount: new Prisma.Decimal(2),
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  let prisma: any;
  let service: IntegrationsService;

  beforeEach(() => {
    prisma = {
      integration: {
        findMany: jest.fn().mockResolvedValue([integration]),
        findUnique: jest.fn().mockResolvedValue(integration),
        upsert: jest.fn().mockResolvedValue(integration),
        update: jest.fn().mockResolvedValue(integration),
      },
      integrationSubscription: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'sub-1', status: 'PENDING' }),
        update: jest.fn().mockResolvedValue({ id: 'sub-1', status: 'PENDING' }),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    service = new IntegrationsService(prisma);
  });

  describe('list', () => {
    it('only returns enabled integrations', async () => {
      await service.list(userId, {});
      expect(prisma.integration.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ enabled: true }) }),
      );
    });

    it('applies a case-insensitive search across name/description/category', async () => {
      await service.list(userId, { search: 'whatsapp' });
      expect(prisma.integration.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([{ name: { contains: 'whatsapp', mode: 'insensitive' } }]),
          }),
        }),
      );
    });

    it('marks an APPROVED subscription as subscribed', async () => {
      prisma.integrationSubscription.findMany.mockResolvedValue([
        { integrationId: integration.id, status: 'APPROVED' },
      ]);
      const [result] = await service.list(userId, {});
      expect(result.subscribed).toBe(true);
      expect(result.subscriptionStatus).toBe('APPROVED');
    });

    it('does NOT mark a PENDING request as subscribed', async () => {
      prisma.integrationSubscription.findMany.mockResolvedValue([
        { integrationId: integration.id, status: 'PENDING' },
      ]);
      const [result] = await service.list(userId, {});
      // Requesting access is not having it -- an admin has not decided yet.
      expect(result.subscribed).toBe(false);
      expect(result.subscriptionStatus).toBe('PENDING');
    });

    it('marks unsubscribed integrations', async () => {
      const [result] = await service.list(userId, {});
      expect(result.subscribed).toBe(false);
    });
  });

  describe('subscribe', () => {
    it('rejects subscribing to a disabled/missing integration', async () => {
      prisma.integration.findUnique.mockResolvedValue({ ...integration, enabled: false });
      await expect(service.subscribe(userId, integration.id)).rejects.toThrow(NotFoundException);
    });

    it('creates a PENDING request rather than granting access', async () => {
      const result = await service.subscribe(userId, integration.id);
      expect(result.subscriptionStatus).toBe('PENDING');
      expect(result.subscribed).toBe(false);
    });

    it('is idempotent on a duplicate request, without resetting an approval', async () => {
      prisma.integrationSubscription.findUnique.mockResolvedValue({
        id: 'sub-1',
        status: 'APPROVED',
      });
      const result = await service.subscribe(userId, integration.id);
      expect(result.subscribed).toBe(true);
      // A double-tap must never knock an approved member back to pending.
      expect(prisma.integrationSubscription.update).not.toHaveBeenCalled();
      expect(prisma.integrationSubscription.create).not.toHaveBeenCalled();
    });

    it('lets a rejected member request again, clearing the old decision', async () => {
      prisma.integrationSubscription.findUnique.mockResolvedValue({
        id: 'sub-1',
        status: 'REJECTED',
      });
      await service.subscribe(userId, integration.id);
      expect(prisma.integrationSubscription.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'PENDING',
            reviewedAt: null,
            reviewNote: null,
          }),
        }),
      );
    });
  });

  describe('isSubscribed -- the access gate', () => {
    it('counts only APPROVED rows', async () => {
      await service.isSubscribed(userId, 'whatsapp-validator');
      expect(prisma.integrationSubscription.count).toHaveBeenCalledWith({
        where: expect.objectContaining({ status: 'APPROVED' }),
      });
    });
  });

  describe('listSubscriptionsForAdmin', () => {
    beforeEach(() => {
      prisma.integrationSubscription.findMany.mockResolvedValue([]);
    });

    it('scopes the queue to one integration when given a slug', async () => {
      await service.listSubscriptionsForAdmin(undefined, 'whatsapp-validator');
      expect(prisma.integrationSubscription.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { integration: { slug: 'whatsapp-validator' } },
        }),
      );
    });

    it('returns every integration when no slug is given', async () => {
      await service.listSubscriptionsForAdmin();
      expect(prisma.integrationSubscription.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} }),
      );
    });

    it('sorts pending ahead of decided rows', async () => {
      await service.listSubscriptionsForAdmin();
      expect(prisma.integrationSubscription.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ status: 'asc' }, { subscribedAt: 'desc' }],
        }),
      );
    });
  });

  describe('reviewSubscription', () => {
    it('approving is what grants access', async () => {
      prisma.integrationSubscription.findUnique.mockResolvedValue({ id: 'sub-1' });
      prisma.integrationSubscription.update.mockResolvedValue({
        id: 'sub-1',
        userId,
        status: 'APPROVED',
        subscribedAt: new Date(),
        reviewedAt: new Date(),
        reviewNote: null,
        integration: { id: integration.id, slug: 'whatsapp-validator', name: 'W' },
        user: { id: userId, email: 'a@b.c', firstName: null, lastName: null },
      });
      const result = await service.reviewSubscription('admin-1', 'sub-1', 'approve');
      expect(result.status).toBe('APPROVED');
      expect(prisma.integrationSubscription.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'APPROVED', reviewedByAdminId: 'admin-1' }),
        }),
      );
    });

    it('rejecting keeps the row so the member can see why', async () => {
      prisma.integrationSubscription.findUnique.mockResolvedValue({ id: 'sub-1' });
      prisma.integrationSubscription.update.mockResolvedValue({
        id: 'sub-1',
        userId,
        status: 'REJECTED',
        subscribedAt: new Date(),
        reviewedAt: new Date(),
        reviewNote: 'Not enough completed trades',
        integration: { id: integration.id, slug: 'whatsapp-validator', name: 'W' },
        user: { id: userId, email: 'a@b.c', firstName: null, lastName: null },
      });
      const result = await service.reviewSubscription(
        'admin-1',
        'sub-1',
        'reject',
        'Not enough completed trades',
      );
      expect(result.status).toBe('REJECTED');
      expect(result.reviewNote).toBe('Not enough completed trades');
      expect(prisma.integrationSubscription.deleteMany).not.toHaveBeenCalled();
    });

    it('throws for an unknown request', async () => {
      prisma.integrationSubscription.findUnique.mockResolvedValue(null);
      await expect(
        service.reviewSubscription('admin-1', 'nope', 'approve'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('requireEnabled', () => {
    it('throws when the integration is disabled', async () => {
      prisma.integration.findUnique.mockResolvedValue({ ...integration, enabled: false });
      await expect(service.requireEnabled('whatsapp-validator')).rejects.toThrow(NotFoundException);
    });

    it('returns the row when enabled', async () => {
      const result = await service.requireEnabled('whatsapp-validator');
      expect(result.feeTokenAmount.toString()).toBe('2');
    });
  });

  describe('syncRegistry', () => {
    it('upserts every registry entry by slug, never touching enabled/feeTokenAmount/sortOrder on update', async () => {
      await service.syncRegistry();
      expect(prisma.integration.upsert).toHaveBeenCalledTimes(INTEGRATION_REGISTRY.length);
      for (const definition of INTEGRATION_REGISTRY) {
        expect(prisma.integration.upsert).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { slug: definition.slug },
            create: expect.objectContaining({
              slug: definition.slug,
              name: definition.name,
              feeTokenAmount: definition.defaultFeeTokenAmount,
              sortOrder: definition.defaultSortOrder,
            }),
            update: {
              name: definition.name,
              description: definition.description,
              category: definition.category,
              iconKey: definition.iconKey,
            },
          }),
        );
      }
    });
  });

  describe('update (admin gate)', () => {
    it('only writes enabled/feeTokenAmount/sortOrder, never name/description/category/slug', async () => {
      await service.update(integration.id, { enabled: false, feeTokenAmount: 5, sortOrder: 2 });
      expect(prisma.integration.update).toHaveBeenCalledWith({
        where: { id: integration.id },
        data: { enabled: false, feeTokenAmount: 5, sortOrder: 2 },
      });
    });

    it('rejects updating a non-existent integration', async () => {
      prisma.integration.findUnique.mockResolvedValue(null);
      await expect(service.update('missing', { enabled: true })).rejects.toThrow(NotFoundException);
    });
  });
});

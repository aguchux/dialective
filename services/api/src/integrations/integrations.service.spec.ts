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
        create: jest.fn().mockResolvedValue({ id: 'sub-1' }),
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

    it('marks subscribed integrations', async () => {
      prisma.integrationSubscription.findMany.mockResolvedValue([
        { integrationId: integration.id },
      ]);
      const [result] = await service.list(userId, {});
      expect(result.subscribed).toBe(true);
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

    it('is idempotent on a duplicate subscription', async () => {
      prisma.integrationSubscription.create.mockRejectedValue(
        Object.assign(
          new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }),
          {
            code: 'P2002',
          },
        ),
      );
      const result = await service.subscribe(userId, integration.id);
      expect(result.subscribed).toBe(true);
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

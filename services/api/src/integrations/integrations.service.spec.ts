import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@dialectiva/db';
import { IntegrationsService } from './integrations.service';

describe('IntegrationsService', () => {
  const userId = 'user-1';
  const integration = {
    id: 'integration-1',
    slug: 'whatsapp-validator',
    name: 'WhatsApp Validator',
    description: 'Peer-verify a member\'s WhatsApp number.',
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
        create: jest.fn().mockResolvedValue(integration),
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
            OR: expect.arrayContaining([
              { name: { contains: 'whatsapp', mode: 'insensitive' } },
            ]),
          }),
        }),
      );
    });

    it('marks subscribed integrations', async () => {
      prisma.integrationSubscription.findMany.mockResolvedValue([{ integrationId: integration.id }]);
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
        Object.assign(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }), {
          code: 'P2002',
        }),
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

  describe('admin create', () => {
    it('rejects a duplicate slug', async () => {
      prisma.integration.create.mockRejectedValue(
        Object.assign(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }), {
          code: 'P2002',
        }),
      );
      await expect(
        service.create({ slug: 'whatsapp-validator', name: 'x', description: 'x', category: 'x' }),
      ).rejects.toThrow(ConflictException);
    });
  });
});

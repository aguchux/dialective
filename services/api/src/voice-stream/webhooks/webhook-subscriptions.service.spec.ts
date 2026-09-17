import { NotFoundException } from '@nestjs/common';
import { WebhookEventType } from '@dialectiva/db';
import { WebhookSubscriptionsService } from './webhook-subscriptions.service';

function setup() {
  process.env.API_TOKEN_ENCRYPTION_KEY = 'test-passphrase-do-not-use-in-prod';
  const prisma = {
    webhookSubscription: {
      findMany: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
    webhookDeliveryLog: { findMany: jest.fn() },
  };
  const service = new WebhookSubscriptionsService(prisma as never);
  return { service, prisma };
}

describe('WebhookSubscriptionsService.create', () => {
  it('generates and encrypts a secret, returning plaintext exactly once', async () => {
    const { service, prisma } = setup();
    prisma.webhookSubscription.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) => Promise.resolve({ id: 'sub-1', ...data }),
    );

    const result = await service.create('org-1', 'user-1', {
      url: 'https://example.com/hook',
      eventTypes: [WebhookEventType.DECK_CREATED],
    });

    expect(result.plaintextSecret).toBeTruthy();
    expect(result).not.toHaveProperty('encryptedSecret');
    expect(JSON.stringify(result)).not.toContain('encryptedSecret');
    const [[{ data: created }]] = prisma.webhookSubscription.create.mock.calls;
    expect(created.encryptedSecret).not.toContain(result.plaintextSecret);
  });
});

describe('WebhookSubscriptionsService.remove', () => {
  it('rejects a subscription belonging to another organization', async () => {
    const { service, prisma } = setup();
    prisma.webhookSubscription.findUnique.mockResolvedValue({
      id: 'sub-1',
      organizationId: 'other-org',
    });

    await expect(service.remove('org-1', 'sub-1')).rejects.toThrow(NotFoundException);
    expect(prisma.webhookSubscription.delete).not.toHaveBeenCalled();
  });

  it('deletes a subscription belonging to the caller organization', async () => {
    const { service, prisma } = setup();
    prisma.webhookSubscription.findUnique.mockResolvedValue({
      id: 'sub-1',
      organizationId: 'org-1',
    });

    await service.remove('org-1', 'sub-1');

    expect(prisma.webhookSubscription.delete).toHaveBeenCalledWith({ where: { id: 'sub-1' } });
  });
});

describe('WebhookSubscriptionsService.getDecryptedSecret', () => {
  it('decrypts a previously-created secret back to its original plaintext', async () => {
    const { service, prisma } = setup();
    let stored: Record<string, unknown> | null = null;
    prisma.webhookSubscription.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) => {
        stored = { id: 'sub-1', ...data };
        return Promise.resolve(stored);
      },
    );
    const created = await service.create('org-1', 'user-1', {
      url: 'https://example.com/hook',
      eventTypes: [WebhookEventType.DECK_CREATED],
    });
    prisma.webhookSubscription.findUnique.mockResolvedValue(stored);

    await expect(service.getDecryptedSecret('sub-1')).resolves.toBe(created.plaintextSecret);
  });

  it('returns null for an unknown subscription', async () => {
    const { service, prisma } = setup();
    prisma.webhookSubscription.findUnique.mockResolvedValue(null);

    await expect(service.getDecryptedSecret('sub-1')).resolves.toBeNull();
  });
});

describe('WebhookSubscriptionsService.findActiveSubscribers', () => {
  it('queries by organizationId, active=true, and eventTypes has the event', async () => {
    const { service, prisma } = setup();
    prisma.webhookSubscription.findMany.mockResolvedValue([]);

    await service.findActiveSubscribers('org-1', WebhookEventType.DECK_CREATED);

    expect(prisma.webhookSubscription.findMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        active: true,
        eventTypes: { has: WebhookEventType.DECK_CREATED },
      },
    });
  });
});

import { WebhookDeliveryExportService } from './webhook-delivery-export.service';

function setup() {
  const prisma = { webhookDeliveryLog: { findMany: jest.fn().mockResolvedValue([]) } };
  const service = new WebhookDeliveryExportService(prisma as never);
  return { service, prisma };
}

describe('WebhookDeliveryExportService.build', () => {
  it('scopes the query to the org via the subscription relation', async () => {
    const { service, prisma } = setup();

    await service.build('org-1', {});

    expect(prisma.webhookDeliveryLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ subscription: { organizationId: 'org-1' } }),
      }),
    );
  });

  it('applies eventType and succeeded filters', async () => {
    const { service, prisma } = setup();

    await service.build('org-1', { eventType: 'DECK_CREATED' as never, succeeded: false });

    expect(prisma.webhookDeliveryLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ eventType: 'DECK_CREATED', succeeded: false }),
      }),
    );
  });

  it('flattens the joined subscription url into each row', async () => {
    const { service, prisma } = setup();
    prisma.webhookDeliveryLog.findMany.mockResolvedValue([
      {
        createdAt: new Date(),
        eventType: 'DECK_CREATED',
        attemptNumber: 1,
        resultCode: 200,
        succeeded: true,
        errorMessage: null,
        subscription: { url: 'https://example.com/webhook' },
      },
    ]);

    const report = await service.build('org-1', {});

    expect(report.rows[0]).toEqual(
      expect.objectContaining({ subscriptionUrl: 'https://example.com/webhook' }),
    );
  });
});

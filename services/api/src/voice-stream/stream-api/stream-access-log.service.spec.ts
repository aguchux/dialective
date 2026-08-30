import { StreamAccessLogService } from './stream-access-log.service';

function setup() {
  const prisma = { streamAccessLog: { create: jest.fn() } };
  const service = new StreamAccessLogService(prisma as never);
  return { service, prisma };
}

describe('StreamAccessLogService.record', () => {
  it('persists a denied/errored request, not just successful ones', async () => {
    const { service, prisma } = setup();
    prisma.streamAccessLog.create.mockResolvedValue({});

    await service.record({
      streamApiKeyId: 'key-1',
      organizationId: 'org-1',
      requestType: 'audio',
      resultCode: 403,
      entitlementDecision: 'denied:no_scope',
    });

    expect(prisma.streamAccessLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ resultCode: 403, entitlementDecision: 'denied:no_scope' }),
      }),
    );
  });

  it('does not throw when the write itself fails', async () => {
    const { service, prisma } = setup();
    prisma.streamAccessLog.create.mockRejectedValue(new Error('db down'));

    await expect(
      service.record({
        streamApiKeyId: 'key-1',
        organizationId: 'org-1',
        requestType: 'manifest',
        resultCode: 200,
        entitlementDecision: 'allowed',
      }),
    ).resolves.toBeUndefined();
  });
});

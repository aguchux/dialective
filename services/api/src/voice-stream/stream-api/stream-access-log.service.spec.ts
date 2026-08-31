import { StreamAccessLogService } from './stream-access-log.service';

function setup() {
  const prisma = { streamAccessLog: { create: jest.fn() } };
  const usageCounter = { increment: jest.fn().mockResolvedValue(undefined) };
  const service = new StreamAccessLogService(prisma as never, usageCounter as never);
  return { service, prisma, usageCounter };
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

  it('increments the usage counter for the organization', async () => {
    const { service, prisma, usageCounter } = setup();
    prisma.streamAccessLog.create.mockResolvedValue({});

    await service.record({
      streamApiKeyId: 'key-1',
      organizationId: 'org-1',
      requestType: 'audio',
      resultCode: 200,
      entitlementDecision: 'allowed',
      bytesStreamed: BigInt(1024),
    });

    expect(usageCounter.increment).toHaveBeenCalledWith('org-1', { bytes: BigInt(1024), requests: 1 });
  });

  it('still increments the usage counter even when the log write itself fails', async () => {
    const { service, prisma, usageCounter } = setup();
    prisma.streamAccessLog.create.mockRejectedValue(new Error('db down'));

    await service.record({
      streamApiKeyId: 'key-1',
      organizationId: 'org-1',
      requestType: 'manifest',
      resultCode: 200,
      entitlementDecision: 'allowed',
    });

    expect(usageCounter.increment).toHaveBeenCalledWith('org-1', { bytes: undefined, requests: 1 });
  });
});

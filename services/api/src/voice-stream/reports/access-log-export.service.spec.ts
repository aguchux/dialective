import { AccessLogExportService } from './access-log-export.service';

function setup() {
  const prisma = { streamAccessLog: { findMany: jest.fn().mockResolvedValue([]) } };
  const service = new AccessLogExportService(prisma as never);
  return { service, prisma };
}

describe('AccessLogExportService.build', () => {
  it('returns an empty rows array when there are no logs', async () => {
    const { service } = setup();

    const report = await service.build('org-1', {});

    expect(report).toEqual({ rows: [] });
  });

  it('applies date-range and entitlementDecision filters', async () => {
    const { service, prisma } = setup();
    const from = new Date('2026-01-01');
    const to = new Date('2026-01-31');

    await service.build('org-1', { from, to, entitlementDecision: 'denied:tier_gated' });

    expect(prisma.streamAccessLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org-1',
          createdAt: { gte: from, lte: to },
          entitlementDecision: 'denied:tier_gated',
        }),
      }),
    );
  });

  it('stringifies bigint bytesStreamed for JSON safety', async () => {
    const { service, prisma } = setup();
    prisma.streamAccessLog.findMany.mockResolvedValue([
      {
        createdAt: new Date(),
        credentialType: 'stream_key',
        streamApiKeyId: 'key-1',
        deckId: 'deck-1',
        recordingId: 'rec-1',
        requestType: 'audio',
        resultCode: 200,
        entitlementDecision: 'allowed',
        bytesStreamed: BigInt(12345),
        ipAddress: '1.2.3.4',
        userAgent: 'curl/8',
      },
    ]);

    const report = await service.build('org-1', {});

    expect(report.rows[0].bytesStreamed).toBe('12345');
  });
});

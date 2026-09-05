import { OrgActivityService } from './org-activity.service';

function setup() {
  const prisma = { orgActivityEvent: { create: jest.fn() } };
  const service = new OrgActivityService(prisma as never);
  return { service, prisma };
}

describe('OrgActivityService.record', () => {
  it('writes an activity event row with the given fields', async () => {
    const { service, prisma } = setup();
    prisma.orgActivityEvent.create.mockResolvedValue({ id: 'evt-1' });

    await service.record('org-1', 'KEY_CREATED', 'user-1', { keyPrefix: 'dlsk_live_abc' });

    expect(prisma.orgActivityEvent.create).toHaveBeenCalledWith({
      data: {
        organizationId: 'org-1',
        eventType: 'KEY_CREATED',
        actorUserId: 'user-1',
        metadata: { keyPrefix: 'dlsk_live_abc' },
      },
    });
  });

  it('never throws when the write fails', async () => {
    const { service, prisma } = setup();
    prisma.orgActivityEvent.create.mockRejectedValue(new Error('db down'));

    await expect(service.record('org-1', 'KEY_REVOKED', null, {})).resolves.toBeUndefined();
  });

  it('logs the failure so a silently-failing audit write is still observable (finding: audit writes must not fail silent AND unlogged)', async () => {
    const { service, prisma } = setup();
    prisma.orgActivityEvent.create.mockRejectedValue(new Error('db down'));
    const errorSpy = jest.spyOn((service as unknown as { logger: { error: (msg: string) => void } }).logger, 'error');

    await service.record('org-1', 'KEY_REVOKED', null, {});

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('db down'));
  });
});

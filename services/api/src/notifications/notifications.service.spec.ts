import { NotFoundException } from '@nestjs/common';
import { NotificationsService } from './notifications.service';

function setup() {
  const prisma = {
    systemUpdate: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    userNotification: {
      groupBy: jest.fn().mockResolvedValue([]),
    },
  };
  const service = new NotificationsService(prisma as never);
  return { service, prisma };
}

describe('NotificationsService.listAdminUpdates', () => {
  it('attaches readCount per update from the groupBy result, defaulting to 0 when absent', async () => {
    const { service, prisma } = setup();
    prisma.systemUpdate.findMany.mockResolvedValue([
      { id: 'u1', _count: { notifications: 10 } },
      { id: 'u2', _count: { notifications: 5 } },
    ]);
    prisma.userNotification.groupBy.mockResolvedValue([
      { updateId: 'u1', _count: { _all: 7 } },
    ]);

    const result = await service.listAdminUpdates();

    expect(result).toEqual([
      expect.objectContaining({ id: 'u1', readCount: 7 }),
      expect.objectContaining({ id: 'u2', readCount: 0 }),
    ]);
    expect(prisma.userNotification.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ updateId: { in: ['u1', 'u2'] }, readAt: { not: null } }) }),
    );
  });

  it('skips the groupBy call entirely when there are no updates', async () => {
    const { service, prisma } = setup();
    prisma.systemUpdate.findMany.mockResolvedValue([]);

    const result = await service.listAdminUpdates();

    expect(result).toEqual([]);
    expect(prisma.userNotification.groupBy).not.toHaveBeenCalled();
  });
});

describe('NotificationsService.updateUpdate', () => {
  it('updates only the fields provided, trimming title/message', async () => {
    const { service, prisma } = setup();
    prisma.systemUpdate.findUnique.mockResolvedValue({ id: 'u1' });
    prisma.systemUpdate.update.mockResolvedValue({ id: 'u1', title: 'New title' });

    await service.updateUpdate('u1', { title: '  New title  ' });

    expect(prisma.systemUpdate.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { title: 'New title' } });
  });

  it('clears href when an empty string is passed', async () => {
    const { service, prisma } = setup();
    prisma.systemUpdate.findUnique.mockResolvedValue({ id: 'u1' });
    prisma.systemUpdate.update.mockResolvedValue({ id: 'u1' });

    await service.updateUpdate('u1', { href: '' });

    expect(prisma.systemUpdate.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { href: null } });
  });

  it('leaves href untouched when omitted', async () => {
    const { service, prisma } = setup();
    prisma.systemUpdate.findUnique.mockResolvedValue({ id: 'u1' });
    prisma.systemUpdate.update.mockResolvedValue({ id: 'u1' });

    await service.updateUpdate('u1', { title: 'x' });

    expect(prisma.systemUpdate.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { title: 'x' } });
  });

  it('rejects an empty title', async () => {
    const { service, prisma } = setup();
    prisma.systemUpdate.findUnique.mockResolvedValue({ id: 'u1' });

    await expect(service.updateUpdate('u1', { title: '   ' })).rejects.toThrow('Title cannot be empty');
    expect(prisma.systemUpdate.update).not.toHaveBeenCalled();
  });

  it('throws NotFoundException for a missing update', async () => {
    const { service, prisma } = setup();
    prisma.systemUpdate.findUnique.mockResolvedValue(null);

    await expect(service.updateUpdate('missing', { title: 'x' })).rejects.toThrow(NotFoundException);
  });
});

describe('NotificationsService.deleteUpdate', () => {
  it('deletes an existing update', async () => {
    const { service, prisma } = setup();
    prisma.systemUpdate.findUnique.mockResolvedValue({ id: 'u1' });
    prisma.systemUpdate.delete.mockResolvedValue({ id: 'u1' });

    const result = await service.deleteUpdate('u1');

    expect(result).toEqual({ id: 'u1', deleted: true });
    expect(prisma.systemUpdate.delete).toHaveBeenCalledWith({ where: { id: 'u1' } });
  });

  it('throws NotFoundException for a missing update', async () => {
    const { service, prisma } = setup();
    prisma.systemUpdate.findUnique.mockResolvedValue(null);

    await expect(service.deleteUpdate('missing')).rejects.toThrow(NotFoundException);
    expect(prisma.systemUpdate.delete).not.toHaveBeenCalled();
  });
});

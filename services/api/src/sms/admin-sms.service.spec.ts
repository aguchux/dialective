import { AdminSmsService } from './admin-sms.service';

describe('AdminSmsService', () => {
  let prisma: any;
  let sms: any;
  let service: AdminSmsService;

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn() },
      adminSmsMessage: { create: jest.fn(), findMany: jest.fn(), count: jest.fn() },
      $transaction: jest.fn((ops: unknown[]) => Promise.all(ops as Promise<unknown>[])),
    };
    sms = { sendTransactional: jest.fn() };
    service = new AdminSmsService(prisma, sms);
  });

  it('sends to the saved phone and writes a provider-attributed audit record', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'recipient-1', phoneNumber: '+2348012345678' });
    sms.sendTransactional.mockResolvedValue({ provider: 'smslive247' });
    prisma.adminSmsMessage.create.mockResolvedValue({
      id: 'message-1',
      status: 'SENT',
      createdAt: new Date('2026-09-03T12:00:00.000Z'),
    });

    const result = await service.send('admin-1', {
      recipientId: 'recipient-1',
      message: 'Your payout is ready.',
    });

    expect(sms.sendTransactional).toHaveBeenCalledWith(
      '+2348012345678',
      'Your payout is ready.',
      undefined,
    );
    expect(prisma.adminSmsMessage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        senderId: 'admin-1',
        recipientId: 'recipient-1',
        phoneNumber: '+2348012345678',
        body: 'Your payout is ready.',
        provider: 'smslive247',
        status: 'SENT',
      }),
    });
    expect(result).toEqual({
      id: 'message-1',
      status: 'SENT',
      provider: 'smslive247',
      createdAt: new Date('2026-09-03T12:00:00.000Z'),
    });
  });

  it('passes a chosen provider override through to sendTransactional and records it on success', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'recipient-1', phoneNumber: '+2348012345678' });
    sms.sendTransactional.mockResolvedValue({ provider: 'twilio' });
    prisma.adminSmsMessage.create.mockResolvedValue({
      id: 'message-3',
      status: 'SENT',
      createdAt: new Date('2026-09-03T12:00:00.000Z'),
    });

    await service.send('admin-1', {
      recipientId: 'recipient-1',
      message: 'Testing twilio.',
      provider: 'twilio',
    });

    expect(sms.sendTransactional).toHaveBeenCalledWith(
      '+2348012345678',
      'Testing twilio.',
      'twilio',
    );
    expect(prisma.adminSmsMessage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ provider: 'twilio', status: 'SENT' }),
    });
  });

  it('records which provider was attempted when a forced-provider send fails', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'recipient-1', phoneNumber: '+2348012345678' });
    sms.sendTransactional.mockRejectedValue(new Error('Twilio credentials rejected'));
    prisma.adminSmsMessage.create.mockResolvedValue({ id: 'message-4' });

    await expect(
      service.send('admin-1', {
        recipientId: 'recipient-1',
        message: 'Testing twilio.',
        provider: 'twilio',
      }),
    ).rejects.toThrow('Twilio credentials rejected');

    expect(prisma.adminSmsMessage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        provider: 'twilio',
        status: 'FAILED',
        failureReason: 'Twilio credentials rejected',
      }),
    });
  });

  it('records a failed send before returning the delivery error', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'recipient-1', phoneNumber: '+2348012345678' });
    sms.sendTransactional.mockRejectedValue(new Error('All providers failed'));
    prisma.adminSmsMessage.create.mockResolvedValue({ id: 'message-2' });

    await expect(
      service.send('admin-1', {
        recipientId: 'recipient-1',
        message: 'Please update your profile.',
      }),
    ).rejects.toThrow('All providers failed');

    expect(prisma.adminSmsMessage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: 'FAILED',
        failureReason: 'All providers failed',
      }),
    });
  });

  describe('listMessages', () => {
    it('throws NotFoundException when the contact does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.listMessages('missing-1', {})).rejects.toThrow('Contact was not found');
      expect(prisma.adminSmsMessage.findMany).not.toHaveBeenCalled();
    });

    it('returns the thread oldest-first even though the DB query is newest-first', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'contact-1' });
      prisma.adminSmsMessage.findMany.mockResolvedValue([
        { id: 'msg-2', body: 'second', status: 'SENT', createdAt: new Date('2026-09-02') },
        { id: 'msg-1', body: 'first', status: 'SENT', createdAt: new Date('2026-09-01') },
      ]);
      prisma.adminSmsMessage.count.mockResolvedValue(2);

      const result = await service.listMessages('contact-1', {});

      expect(result.items.map((item: { id: string }) => item.id)).toEqual(['msg-1', 'msg-2']);
      expect(result.total).toBe(2);
      expect(prisma.adminSmsMessage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { recipientId: 'contact-1' },
          orderBy: { createdAt: 'desc' },
        }),
      );
    });

    it('paginates using page/pageSize defaults', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'contact-1' });
      prisma.adminSmsMessage.findMany.mockResolvedValue([]);
      prisma.adminSmsMessage.count.mockResolvedValue(0);

      const result = await service.listMessages('contact-1', {});

      expect(result).toMatchObject({ page: 1, pageSize: 50, total: 0, totalPages: 1 });
      expect(prisma.adminSmsMessage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 50 }),
      );
    });
  });
});

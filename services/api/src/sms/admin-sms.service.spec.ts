import { AdminSmsService } from './admin-sms.service';

describe('AdminSmsService', () => {
  let prisma: any;
  let sms: any;
  let service: AdminSmsService;

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn() },
      adminSmsMessage: { create: jest.fn() },
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

    expect(sms.sendTransactional).toHaveBeenCalledWith('+2348012345678', 'Your payout is ready.');
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

  it('records a failed send before returning the delivery error', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'recipient-1', phoneNumber: '+2348012345678' });
    sms.sendTransactional.mockRejectedValue(new Error('All providers failed'));
    prisma.adminSmsMessage.create.mockResolvedValue({ id: 'message-2' });

    await expect(
      service.send('admin-1', { recipientId: 'recipient-1', message: 'Please update your profile.' }),
    ).rejects.toThrow('All providers failed');

    expect(prisma.adminSmsMessage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: 'FAILED',
        failureReason: 'All providers failed',
      }),
    });
  });
});

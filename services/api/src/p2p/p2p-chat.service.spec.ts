import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Role } from '@dialectiva/db';
import { P2PChatService } from './p2p-chat.service';

function makeTrade(overrides: Record<string, unknown> = {}) {
  return {
    id: 'trade-1',
    buyerId: 'buyer-1',
    sellerId: 'seller-1',
    status: 'AWAITING_PAYMENT',
    disputedAt: null,
    ...overrides,
  };
}

function makeMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: 'msg-1',
    tradeId: 'trade-1',
    senderId: 'buyer-1',
    isFromAdmin: false,
    body: 'hello',
    attachmentKey: null,
    attachmentContentType: null,
    createdAt: new Date(),
    sender: {
      id: 'buyer-1',
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'buyer@example.com',
      role: Role.TRAINER,
    },
    ...overrides,
  };
}

function setup(trade: unknown) {
  const prisma = {
    p2PTokenTrade: { findUnique: jest.fn().mockResolvedValue(trade) },
    p2PTradeMessage: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
      create: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({ email: 'party@example.com' }),
    },
  };
  const storage = {
    createPresignedUploadUrl: jest.fn().mockResolvedValue({
      url: 'https://upload.example/put',
      key: 'trade-1/file.jpg',
      expiresInSeconds: 900,
    }),
    createPresignedDownloadUrl: jest.fn().mockResolvedValue({
      url: 'https://download.example/get',
      expiresInSeconds: 900,
    }),
  };
  const mail = {
    sendP2PAdminJoinedDisputeEmail: jest.fn().mockResolvedValue(undefined),
  };
  const service = new P2PChatService(prisma as never, storage as never, mail as never);
  return { service, prisma, storage, mail };
}

/** notifyPartiesAdminJoined is fire-and-forget (void this.notify...) -- flush microtasks so its assertions are observable before the test checks them. */
async function flushMicrotasks() {
  await new Promise((resolve) => setImmediate(resolve));
}

describe('P2PChatService -- access control', () => {
  it('allows a buyer to list messages on their own trade', async () => {
    const { service, prisma } = setup(makeTrade());
    prisma.p2PTradeMessage.findMany.mockResolvedValue([makeMessage()]);

    const result = await service.listMessages('buyer-1', Role.TRAINER, 'trade-1');

    expect(result).toHaveLength(1);
    expect(result[0].body).toBe('hello');
  });

  it('allows a seller to list messages on their own trade', async () => {
    const { service } = setup(makeTrade());
    await expect(service.listMessages('seller-1', Role.TRAINER, 'trade-1')).resolves.toEqual([]);
  });

  it('rejects a non-participant, non-admin user', async () => {
    const { service } = setup(makeTrade());
    await expect(service.listMessages('stranger-1', Role.TRAINER, 'trade-1')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('rejects an admin on a trade that is not disputed', async () => {
    const { service } = setup(makeTrade({ disputedAt: null }));
    await expect(service.listMessages('admin-1', Role.ADMIN, 'trade-1')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('allows an admin once the trade has been disputed', async () => {
    const { service } = setup(makeTrade({ disputedAt: new Date(), status: 'DISPUTED' }));
    await expect(service.listMessages('admin-1', Role.ADMIN, 'trade-1')).resolves.toEqual([]);
  });

  it('throws NotFoundException for a trade that does not exist', async () => {
    const { service } = setup(null);
    await expect(service.listMessages('buyer-1', Role.TRAINER, 'missing')).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('P2PChatService.sendMessage', () => {
  it('rejects a message with neither body nor attachment', async () => {
    const { service } = setup(makeTrade());
    await expect(
      service.sendMessage('buyer-1', Role.TRAINER, 'trade-1', {}),
    ).rejects.toThrow('Message must include text or an attachment');
  });

  it('persists a text message from a participant', async () => {
    const { service, prisma } = setup(makeTrade());
    prisma.p2PTradeMessage.create.mockResolvedValue(makeMessage({ body: 'I have paid' }));

    const result = await service.sendMessage('buyer-1', Role.TRAINER, 'trade-1', {
      body: 'I have paid',
    });

    expect(result.body).toBe('I have paid');
    expect(prisma.p2PTradeMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tradeId: 'trade-1', senderId: 'buyer-1', isFromAdmin: false }),
      }),
    );
  });

  it('flags a message from an admin on a disputed trade as isFromAdmin', async () => {
    const { service, prisma } = setup(makeTrade({ disputedAt: new Date(), status: 'DISPUTED' }));
    prisma.p2PTradeMessage.create.mockResolvedValue(
      makeMessage({ senderId: 'admin-1', isFromAdmin: true, body: 'Please share your receipt' }),
    );

    await service.sendMessage('admin-1', Role.ADMIN, 'trade-1', { body: 'Please share your receipt' });

    expect(prisma.p2PTradeMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isFromAdmin: true }) }),
    );
  });

  it('does not flag an admin who is also a trade participant as isFromAdmin', async () => {
    const { service, prisma } = setup(makeTrade({ buyerId: 'admin-1', disputedAt: new Date() }));
    prisma.p2PTradeMessage.create.mockResolvedValue(makeMessage({ senderId: 'admin-1' }));

    await service.sendMessage('admin-1', Role.ADMIN, 'trade-1', { body: 'hi' });

    expect(prisma.p2PTradeMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isFromAdmin: false }) }),
    );
  });

  describe('admin-joined-dispute notification', () => {
    it('emails both buyer and seller on the admin\'s first message in the thread', async () => {
      const { service, prisma, mail } = setup(
        makeTrade({ disputedAt: new Date(), status: 'DISPUTED' }),
      );
      prisma.p2PTradeMessage.count.mockResolvedValue(0);
      prisma.p2PTradeMessage.create.mockResolvedValue(
        makeMessage({ senderId: 'admin-1', isFromAdmin: true, body: 'Please share your receipt' }),
      );

      await service.sendMessage('admin-1', Role.ADMIN, 'trade-1', { body: 'Please share your receipt' });
      await flushMicrotasks();

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'buyer-1' },
        select: { email: true },
      });
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'seller-1' },
        select: { email: true },
      });
      expect(mail.sendP2PAdminJoinedDisputeEmail).toHaveBeenCalledTimes(2);
      expect(mail.sendP2PAdminJoinedDisputeEmail).toHaveBeenCalledWith('party@example.com', 'trade-1');
    });

    it('does not email again on a second admin message in the same thread', async () => {
      const { service, prisma, mail } = setup(
        makeTrade({ disputedAt: new Date(), status: 'DISPUTED' }),
      );
      // A prior admin message already exists in this thread.
      prisma.p2PTradeMessage.count.mockResolvedValue(1);
      prisma.p2PTradeMessage.create.mockResolvedValue(
        makeMessage({ senderId: 'admin-1', isFromAdmin: true, body: 'Follow-up' }),
      );

      await service.sendMessage('admin-1', Role.ADMIN, 'trade-1', { body: 'Follow-up' });
      await flushMicrotasks();

      expect(mail.sendP2PAdminJoinedDisputeEmail).not.toHaveBeenCalled();
    });

    it('does not email when the message is from a trade participant, not an admin', async () => {
      const { service, prisma, mail } = setup(makeTrade());
      prisma.p2PTradeMessage.create.mockResolvedValue(makeMessage({ body: 'I have paid' }));

      await service.sendMessage('buyer-1', Role.TRAINER, 'trade-1', { body: 'I have paid' });
      await flushMicrotasks();

      expect(prisma.p2PTradeMessage.count).not.toHaveBeenCalled();
      expect(mail.sendP2PAdminJoinedDisputeEmail).not.toHaveBeenCalled();
    });

    it('never lets an email-send failure reject the sendMessage call', async () => {
      const { service, prisma, mail } = setup(
        makeTrade({ disputedAt: new Date(), status: 'DISPUTED' }),
      );
      prisma.p2PTradeMessage.count.mockResolvedValue(0);
      prisma.p2PTradeMessage.create.mockResolvedValue(
        makeMessage({ senderId: 'admin-1', isFromAdmin: true, body: 'hi' }),
      );
      mail.sendP2PAdminJoinedDisputeEmail.mockRejectedValue(new Error('mail provider down'));

      await expect(
        service.sendMessage('admin-1', Role.ADMIN, 'trade-1', { body: 'hi' }),
      ).resolves.toBeDefined();
      await flushMicrotasks();
    });
  });
});

describe('P2PChatService.createUploadUrl / attachmentDownloadUrl', () => {
  it('issues a private (non-public-read) presigned upload URL for a participant', async () => {
    const { service, storage } = setup(makeTrade());

    const result = await service.createUploadUrl('buyer-1', Role.TRAINER, 'trade-1', {
      contentType: 'image/jpeg',
    });

    expect(result.uploadUrl).toBe('https://upload.example/put');
    expect(storage.createPresignedUploadUrl).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringMatching(/^trade-1\//),
      'image/jpeg',
      false,
    );
  });

  it('rejects an upload-url request from a non-participant', async () => {
    const { service } = setup(makeTrade());
    await expect(
      service.createUploadUrl('stranger-1', Role.TRAINER, 'trade-1', { contentType: 'image/jpeg' }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('returns a presigned download URL for an existing attachment', async () => {
    const { service, prisma } = setup(makeTrade());
    prisma.p2PTradeMessage.findFirst.mockResolvedValue(
      makeMessage({ attachmentKey: 'trade-1/proof.jpg' }),
    );

    const result = await service.attachmentDownloadUrl('buyer-1', Role.TRAINER, 'trade-1', 'msg-1');

    expect(result.url).toBe('https://download.example/get');
  });

  it('throws NotFoundException when the message has no attachment', async () => {
    const { service, prisma } = setup(makeTrade());
    prisma.p2PTradeMessage.findFirst.mockResolvedValue(makeMessage({ attachmentKey: null }));

    await expect(
      service.attachmentDownloadUrl('buyer-1', Role.TRAINER, 'trade-1', 'msg-1'),
    ).rejects.toThrow(NotFoundException);
  });
});

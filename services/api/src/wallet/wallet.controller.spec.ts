import { WalletController } from './wallet.controller';

describe('WalletController NOWPayments IPN', () => {
  const finishedBody = {
    payment_id: 12345,
    invoice_id: 'invoice-1',
    payment_status: 'finished',
    order_id: 'deposit-1',
    price_amount: 10,
    price_currency: 'usd',
    actually_paid: 10,
    pay_currency: 'usdttrc20',
  };

  function setup(eventOverrides: Record<string, unknown> = {}) {
    const event = { id: 'event-1', processedAt: null, ...eventOverrides };
    const tx = {
      deposit: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      ledgerEntry: { create: jest.fn().mockResolvedValue({}) },
      wallet: { update: jest.fn().mockResolvedValue({}) },
      nowPaymentsIpnEvent: { update: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      nowPaymentsIpnEvent: {
        upsert: jest.fn().mockResolvedValue(event),
        update: jest.fn().mockResolvedValue({}),
      },
      deposit: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'deposit-1',
          walletId: 'wallet-1',
          providerChargeId: 'invoice-1',
          usdAmount: { toString: () => '10' },
          tokenAmount: 100,
          status: 'pending',
          wallet: { user: { referredById: null } },
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      referralSettings: {
        upsert: jest.fn().mockResolvedValue({ fundingBonusEnabled: false, fundingBonusRate: { gt: () => false } }),
      },
      $transaction: jest.fn(async (input: unknown) => {
        if (typeof input === 'function') return input(tx);
        return Promise.all(input as Promise<unknown>[]);
      }),
    };
    const nowPayments = {
      verifyIpnSignature: jest.fn().mockReturnValue(true),
      getIpnEventHash: jest.fn().mockReturnValue('event-hash'),
    };
    const controller = new WalletController(prisma as never, nowPayments as never, {} as never, {} as never);
    return { controller, prisma, tx };
  }

  it('credits a finished payment in one atomic transaction', async () => {
    const { controller, prisma, tx } = setup();

    await expect(controller.handleNowPaymentsWebhook(finishedBody, 'valid')).resolves.toEqual({
      received: true,
      credited: true,
      status: 'finished',
    });
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function));
    expect(tx.deposit.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'deposit-1', status: { not: 'confirmed' } },
    }));
    expect(tx.ledgerEntry.create).toHaveBeenCalledTimes(1);
    expect(tx.wallet.update).toHaveBeenCalledTimes(1);
  });

  it('acknowledges an already processed duplicate without touching the deposit', async () => {
    const { controller, prisma } = setup({ processedAt: new Date() });

    await expect(controller.handleNowPaymentsWebhook(finishedBody, 'valid')).resolves.toEqual({
      received: true,
      duplicate: true,
    });
    expect(prisma.deposit.findUnique).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects callbacks with an invalid signature before persistence', async () => {
    const { controller, prisma } = setup();
    (controller as unknown as { nowPayments: { verifyIpnSignature: jest.Mock } }).nowPayments.verifyIpnSignature.mockReturnValue(false);

    await expect(controller.handleNowPaymentsWebhook(finishedBody, 'invalid')).rejects.toThrow('Invalid webhook signature');
    expect(prisma.nowPaymentsIpnEvent.upsert).not.toHaveBeenCalled();
  });

  it('records and acknowledges a non-final payment status without crediting', async () => {
    const { controller, prisma, tx } = setup();

    await expect(
      controller.handleNowPaymentsWebhook({ ...finishedBody, payment_status: 'confirming' }, 'valid'),
    ).resolves.toEqual({ received: true, credited: false, status: 'confirming' });
    expect(prisma.deposit.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ providerStatus: 'confirming', status: 'pending' }),
    }));
    expect(tx.ledgerEntry.create).not.toHaveBeenCalled();
  });

  it('does not credit a finished callback whose amount differs from the deposit', async () => {
    const { controller, prisma, tx } = setup();

    await expect(
      controller.handleNowPaymentsWebhook({ ...finishedBody, price_amount: 9 }, 'valid'),
    ).resolves.toEqual({ received: true, credited: false });
    expect(prisma.nowPaymentsIpnEvent.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ processingError: 'Payment price amount does not match deposit' }),
    }));
    expect(tx.ledgerEntry.create).not.toHaveBeenCalled();
  });
});

describe('WalletController earning history', () => {
  it('returns one wallet earning page in reverse chronological order', async () => {
    const entries = [
      {
        id: 'earning-1',
        type: 'TRAINING_PAYOUT',
        amount: { toString: () => '25.5' },
        reference: 'training-1',
        createdAt: new Date('2026-08-10T12:00:00Z'),
      },
    ];
    const prisma = {
      wallet: { findUnique: jest.fn().mockResolvedValue({ id: 'wallet-1', userId: 'user-1' }) },
      ledgerEntry: {
        findMany: jest.fn().mockResolvedValue(entries),
        count: jest.fn().mockResolvedValue(11),
      },
    };
    const controller = new WalletController(prisma as never, {} as never, {} as never, {} as never);

    await expect(
      controller.listEarnings(
        { user: { sub: 'user-1' } } as never,
        { page: 2, pageSize: 10 },
      ),
    ).resolves.toEqual({
      items: [{ ...entries[0], amount: '25.5' }],
      page: 2,
      pageSize: 10,
      total: 11,
      totalPages: 2,
    });
    expect(prisma.ledgerEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 10, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }),
    );
  });
});

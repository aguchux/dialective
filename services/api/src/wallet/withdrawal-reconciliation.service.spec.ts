import { WithdrawalReconciliationService } from './withdrawal-reconciliation.service';

describe('WithdrawalReconciliationService', () => {
  function setup(processingByProvider: Record<string, Record<string, unknown>[]>) {
    const prisma: any = {
      withdrawalRequest: {
        findMany: jest
          .fn()
          .mockImplementation(({ where }: { where: { provider: string } }) =>
            Promise.resolve(processingByProvider[where.provider] ?? []),
          ),
        update: jest.fn().mockResolvedValue({}),
      },
      nowPaymentsPayoutEvent: { create: jest.fn().mockResolvedValue({}) },
      flutterwavePayoutEvent: { create: jest.fn().mockResolvedValue({}) },
      flutterwaveV4TransferEvent: { create: jest.fn().mockResolvedValue({}) },
      stripePayoutEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    prisma.$transaction = jest.fn(async (ops: unknown[]) => Promise.all(ops as Promise<unknown>[]));

    const nowPayments = { getPayoutStatus: jest.fn() };
    const flutterwave = { getTransferStatus: jest.fn() };
    const flutterwaveV4 = { getTransferStatus: jest.fn() };
    const stripeConnect = { getPayoutStatus: jest.fn() };
    const platformSettings = {
      isNowPaymentsPayoutsEnabled: jest.fn().mockResolvedValue(true),
      isFlutterwavePayoutsEnabled: jest.fn().mockResolvedValue(true),
      isStripePayoutsEnabled: jest.fn().mockResolvedValue(true),
    };
    const service = new WithdrawalReconciliationService(
      prisma as never,
      nowPayments as never,
      flutterwave as never,
      flutterwaveV4 as never,
      stripeConnect as never,
      platformSettings as never,
    );
    return { service, prisma, nowPayments, flutterwave, flutterwaveV4, stripeConnect, platformSettings };
  }

  it('does nothing for any provider when all are disabled', async () => {
    const { service, prisma, platformSettings } = setup({
      nowpayments: [{ id: 'w1', providerPayoutId: 'p1' }],
      flutterwave: [{ id: 'w2', providerPayoutId: 't1' }],
      stripe: [{ id: 'w3', providerPayoutId: 'tr1' }],
    });
    platformSettings.isNowPaymentsPayoutsEnabled.mockResolvedValue(false);
    platformSettings.isFlutterwavePayoutsEnabled.mockResolvedValue(false);
    platformSettings.isStripePayoutsEnabled.mockResolvedValue(false);

    const result = await service.run();

    expect(result.nowpayments).toEqual({
      checked: 0,
      paid: 0,
      failed: 0,
      stillProcessing: 0,
      stale: 0,
    });
    expect(result.flutterwave).toEqual({
      checked: 0,
      paid: 0,
      failed: 0,
      stillProcessing: 0,
      stale: 0,
    });
    expect(result.stripe).toEqual({
      checked: 0,
      paid: 0,
      failed: 0,
      stillProcessing: 0,
      stale: 0,
    });
    expect(prisma.withdrawalRequest.findMany).not.toHaveBeenCalled();
  });

  it('marks a NOWPayments withdrawal PAID when the provider reports a finished status', async () => {
    const { service, prisma, nowPayments } = setup({
      nowpayments: [{ id: 'w1', providerPayoutId: 'p1', submittedToProviderAt: new Date() }],
    });
    nowPayments.getPayoutStatus.mockResolvedValue({ payoutId: 'p1', status: 'finished', raw: {} });

    const result = await service.run();

    expect(result.nowpayments.paid).toBe(1);
    expect(prisma.withdrawalRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'w1' },
        data: expect.objectContaining({ status: 'PAID' }),
      }),
    );
  });

  it('marks a NOWPayments withdrawal FAILED only on a terminal failure status', async () => {
    const { service, prisma, nowPayments } = setup({
      nowpayments: [{ id: 'w1', providerPayoutId: 'p1', submittedToProviderAt: new Date() }],
    });
    nowPayments.getPayoutStatus.mockResolvedValue({ payoutId: 'p1', status: 'rejected', raw: {} });

    const result = await service.run();

    expect(result.nowpayments.failed).toBe(1);
    expect(prisma.withdrawalRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'FAILED', providerError: 'rejected' }),
      }),
    );
  });

  it('leaves a NOWPayments withdrawal PROCESSING when a status poll throws', async () => {
    const { service, prisma, nowPayments } = setup({
      nowpayments: [{ id: 'w1', providerPayoutId: 'p1', submittedToProviderAt: new Date() }],
    });
    nowPayments.getPayoutStatus.mockRejectedValue(new Error('network timeout'));

    const result = await service.run();

    expect(result.nowpayments.checked).toBe(1);
    expect(result.nowpayments.failed).toBe(0);
    expect(result.nowpayments.paid).toBe(0);
    expect(prisma.withdrawalRequest.update).not.toHaveBeenCalled();
  });

  it('flags a NOWPayments withdrawal as stale when PROCESSING for more than 24h', async () => {
    const staleDate = new Date(Date.now() - 25 * 60 * 60 * 1000);
    const { service, nowPayments } = setup({
      nowpayments: [{ id: 'w1', providerPayoutId: 'p1', submittedToProviderAt: staleDate }],
    });
    nowPayments.getPayoutStatus.mockResolvedValue({ payoutId: 'p1', status: 'sending', raw: {} });

    const result = await service.run();

    expect(result.nowpayments.stale).toBe(1);
  });

  it('marks a Flutterwave withdrawal PAID when the provider reports SUCCESSFUL', async () => {
    const { service, prisma, flutterwave } = setup({
      flutterwave: [{ id: 'w2', providerPayoutId: 't1', submittedToProviderAt: new Date() }],
    });
    flutterwave.getTransferStatus.mockResolvedValue({
      transferId: 't1',
      status: 'SUCCESSFUL',
      raw: {},
    });

    const result = await service.run();

    expect(result.flutterwave.paid).toBe(1);
    expect(prisma.withdrawalRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'w2' },
        data: expect.objectContaining({ status: 'PAID' }),
      }),
    );
    expect(prisma.flutterwavePayoutEvent.create).toHaveBeenCalled();
  });

  it('marks a Flutterwave withdrawal FAILED on a terminal failure status', async () => {
    const { service, prisma, flutterwave } = setup({
      flutterwave: [{ id: 'w2', providerPayoutId: 't1', submittedToProviderAt: new Date() }],
    });
    flutterwave.getTransferStatus.mockResolvedValue({
      transferId: 't1',
      status: 'FAILED',
      raw: {},
    });

    const result = await service.run();

    expect(result.flutterwave.failed).toBe(1);
    expect(prisma.withdrawalRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }),
    );
  });

  it('leaves a Flutterwave withdrawal PROCESSING for a NEW/PENDING status', async () => {
    const { service, prisma, flutterwave } = setup({
      flutterwave: [{ id: 'w2', providerPayoutId: 't1', submittedToProviderAt: new Date() }],
    });
    flutterwave.getTransferStatus.mockResolvedValue({
      transferId: 't1',
      status: 'PENDING',
      raw: {},
    });

    const result = await service.run();

    expect(result.flutterwave.stillProcessing).toBe(1);
    expect(prisma.withdrawalRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PROCESSING' }) }),
    );
  });

  it('polls NOWPayments and Flutterwave independently in the same run', async () => {
    const { service, nowPayments, flutterwave } = setup({
      nowpayments: [{ id: 'w1', providerPayoutId: 'p1', submittedToProviderAt: new Date() }],
      flutterwave: [{ id: 'w2', providerPayoutId: 't1', submittedToProviderAt: new Date() }],
    });
    nowPayments.getPayoutStatus.mockResolvedValue({ payoutId: 'p1', status: 'finished', raw: {} });
    flutterwave.getTransferStatus.mockResolvedValue({
      transferId: 't1',
      status: 'SUCCESSFUL',
      raw: {},
    });

    const result = await service.run();

    expect(result.nowpayments.paid).toBe(1);
    expect(result.flutterwave.paid).toBe(1);
  });

  it('marks a Stripe withdrawal PAID when the provider reports transferred', async () => {
    const { service, prisma, stripeConnect } = setup({
      stripe: [{ id: 'w3', providerPayoutId: 'tr1', submittedToProviderAt: new Date() }],
    });
    stripeConnect.getPayoutStatus.mockResolvedValue({
      payoutId: 'tr1',
      status: 'transferred',
      raw: {},
    });

    const result = await service.run();

    expect(result.stripe.paid).toBe(1);
    expect(prisma.withdrawalRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'w3' },
        data: expect.objectContaining({ status: 'PAID' }),
      }),
    );
    expect(prisma.stripePayoutEvent.create).toHaveBeenCalled();
  });

  it('marks a Stripe withdrawal FAILED when the provider reports reversed', async () => {
    const { service, prisma, stripeConnect } = setup({
      stripe: [{ id: 'w3', providerPayoutId: 'tr1', submittedToProviderAt: new Date() }],
    });
    stripeConnect.getPayoutStatus.mockResolvedValue({
      payoutId: 'tr1',
      status: 'reversed',
      raw: {},
    });

    const result = await service.run();

    expect(result.stripe.failed).toBe(1);
    expect(prisma.withdrawalRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }),
    );
  });

  it('leaves a Stripe withdrawal PROCESSING when a status poll throws', async () => {
    const { service, prisma, stripeConnect } = setup({
      stripe: [{ id: 'w3', providerPayoutId: 'tr1', submittedToProviderAt: new Date() }],
    });
    stripeConnect.getPayoutStatus.mockRejectedValue(new Error('network timeout'));

    const result = await service.run();

    expect(result.stripe.checked).toBe(1);
    expect(result.stripe.failed).toBe(0);
    expect(result.stripe.paid).toBe(0);
    expect(prisma.withdrawalRequest.update).not.toHaveBeenCalled();
  });
});

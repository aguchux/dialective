import { WithdrawalReconciliationService } from './withdrawal-reconciliation.service';

describe('WithdrawalReconciliationService', () => {
  function setup(processing: Record<string, unknown>[]) {
    const prisma: any = {
      withdrawalRequest: {
        findMany: jest.fn().mockResolvedValue(processing),
        update: jest.fn().mockResolvedValue({}),
      },
      nowPaymentsPayoutEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    prisma.$transaction = jest.fn(async (ops: unknown[]) => Promise.all(ops as Promise<unknown>[]));

    const nowPayments = { getPayoutStatus: jest.fn() };
    const platformSettings = { isNowPaymentsPayoutsEnabled: jest.fn().mockResolvedValue(true) };
    const service = new WithdrawalReconciliationService(prisma as never, nowPayments as never, platformSettings as never);
    return { service, prisma, nowPayments, platformSettings };
  }

  it('does nothing when NOWPayments payouts are disabled', async () => {
    const { service, prisma, platformSettings } = setup([{ id: 'w1', providerPayoutId: 'p1' }]);
    platformSettings.isNowPaymentsPayoutsEnabled.mockResolvedValue(false);

    const result = await service.run();

    expect(result).toEqual({ checked: 0, paid: 0, failed: 0, stillProcessing: 0, stale: 0 });
    expect(prisma.withdrawalRequest.findMany).not.toHaveBeenCalled();
  });

  it('marks a withdrawal PAID when the provider reports a finished status', async () => {
    const { service, prisma, nowPayments } = setup([{ id: 'w1', providerPayoutId: 'p1', submittedToProviderAt: new Date() }]);
    nowPayments.getPayoutStatus.mockResolvedValue({ payoutId: 'p1', status: 'finished', raw: {} });

    const result = await service.run();

    expect(result.paid).toBe(1);
    expect(prisma.withdrawalRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'w1' }, data: expect.objectContaining({ status: 'PAID' }) }),
    );
  });

  it('marks a withdrawal FAILED only when the provider reports a terminal failure status', async () => {
    const { service, prisma, nowPayments } = setup([{ id: 'w1', providerPayoutId: 'p1', submittedToProviderAt: new Date() }]);
    nowPayments.getPayoutStatus.mockResolvedValue({ payoutId: 'p1', status: 'rejected', raw: {} });

    const result = await service.run();

    expect(result.failed).toBe(1);
    expect(prisma.withdrawalRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED', providerError: 'rejected' }) }),
    );
  });

  it('leaves the withdrawal PROCESSING (does not mark FAILED) when a status poll throws -- transient errors are not terminal failures', async () => {
    const { service, prisma, nowPayments } = setup([{ id: 'w1', providerPayoutId: 'p1', submittedToProviderAt: new Date() }]);
    nowPayments.getPayoutStatus.mockRejectedValue(new Error('network timeout'));

    const result = await service.run();

    expect(result.checked).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.paid).toBe(0);
    expect(prisma.withdrawalRequest.update).not.toHaveBeenCalled();
  });

  it('still-processing status keeps the row PROCESSING and does not touch balances', async () => {
    const { service, prisma, nowPayments } = setup([{ id: 'w1', providerPayoutId: 'p1', submittedToProviderAt: new Date() }]);
    nowPayments.getPayoutStatus.mockResolvedValue({ payoutId: 'p1', status: 'sending', raw: {} });

    const result = await service.run();

    expect(result.stillProcessing).toBe(1);
    expect(prisma.withdrawalRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PROCESSING' }) }),
    );
  });

  it('flags a withdrawal as stale when it has been PROCESSING for more than 24h', async () => {
    const staleDate = new Date(Date.now() - 25 * 60 * 60 * 1000);
    const { service, nowPayments } = setup([{ id: 'w1', providerPayoutId: 'p1', submittedToProviderAt: staleDate }]);
    nowPayments.getPayoutStatus.mockResolvedValue({ payoutId: 'p1', status: 'sending', raw: {} });

    const result = await service.run();

    expect(result.stale).toBe(1);
  });
});

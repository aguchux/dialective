import { WalletController } from './wallet.controller';
import { encryptPayoutField } from '../common/payout-crypto.util';

jest.mock('@dialectiva/db', () => ({
  ...jest.requireActual('@dialectiva/db'),
  creditTrainingPayout: jest.fn(),
  creditAdminFunding: jest.fn(),
  adjustAdminWallet: jest.fn(),
}));
import { adjustAdminWallet, creditAdminFunding, creditTrainingPayout } from '@dialectiva/db';

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
        upsert: jest
          .fn()
          .mockResolvedValue({ fundingBonusEnabled: false, fundingBonusRate: { gt: () => false } }),
      },
      // buildDistributorReferralBonuses (packages/db/src/payouts.ts) reads
      // this before falling back to the legacy referralSettings path above --
      // enabled: false short-circuits it to an empty bonus list, matching
      // this fixture's intent of "no referral bonus of any kind applies".
      distributorSettings: {
        upsert: jest.fn().mockResolvedValue({
          enabled: false,
          multiLevelReferralEnabled: false,
          maxReferralDepth: 0,
        }),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: 'user-1', referredById: null }),
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
    const controller = new WalletController(
      prisma as never,
      nowPayments as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
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
    expect(tx.deposit.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'deposit-1', status: { not: 'confirmed' } },
      }),
    );
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
    (
      controller as unknown as { nowPayments: { verifyIpnSignature: jest.Mock } }
    ).nowPayments.verifyIpnSignature.mockReturnValue(false);

    await expect(controller.handleNowPaymentsWebhook(finishedBody, 'invalid')).rejects.toThrow(
      'Invalid webhook signature',
    );
    expect(prisma.nowPaymentsIpnEvent.upsert).not.toHaveBeenCalled();
  });

  it('records and acknowledges a non-final payment status without crediting', async () => {
    const { controller, prisma, tx } = setup();

    await expect(
      controller.handleNowPaymentsWebhook(
        { ...finishedBody, payment_status: 'confirming' },
        'valid',
      ),
    ).resolves.toEqual({ received: true, credited: false, status: 'confirming' });
    expect(prisma.deposit.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ providerStatus: 'confirming', status: 'pending' }),
      }),
    );
    expect(tx.ledgerEntry.create).not.toHaveBeenCalled();
  });

  it('does not credit a finished callback whose amount differs from the deposit', async () => {
    const { controller, prisma, tx } = setup();

    await expect(
      controller.handleNowPaymentsWebhook({ ...finishedBody, price_amount: 9 }, 'valid'),
    ).resolves.toEqual({ received: true, credited: false });
    expect(prisma.nowPaymentsIpnEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          processingError: 'Payment price amount does not match deposit',
        }),
      }),
    );
    expect(tx.ledgerEntry.create).not.toHaveBeenCalled();
  });
});

describe('WalletController Flutterwave webhook', () => {
  const rawBody = Buffer.from(JSON.stringify({ event: 'charge.completed' }));

  function chargeCompletedRequest(
    dataOverrides: Record<string, unknown> = {},
    bodyOverrides: Record<string, unknown> = {},
  ) {
    const body = {
      event: 'charge.completed',
      data: {
        id: 998877,
        tx_ref: 'deposit-flw-1',
        status: 'successful',
        amount: 5000,
        currency: 'NGN',
        ...dataOverrides,
      },
      ...bodyOverrides,
    };
    return {
      rawBody,
      body,
      headers: { 'verif-hash': 'valid-hash' },
    } as unknown as Parameters<WalletController['handleFlutterwaveWebhook']>[0];
  }

  function setup(eventOverrides: Record<string, unknown> = {}) {
    const event = { id: 'fw-event-1', processedAt: null, ...eventOverrides };
    const tx = {
      deposit: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      ledgerEntry: { create: jest.fn().mockResolvedValue({}) },
      wallet: { update: jest.fn().mockResolvedValue({}) },
    };
    const prisma: any = {
      flutterwaveWebhookEvent: {
        upsert: jest.fn().mockResolvedValue(event),
        update: jest.fn().mockResolvedValue({}),
      },
      deposit: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'deposit-1',
          walletId: 'wallet-1',
          providerChargeId: 'deposit-flw-1',
          currency: 'NGN',
          usdAmount: { toString: () => '10' },
          tokenAmount: 100,
          status: 'pending',
        }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'deposit-1',
          walletId: 'wallet-1',
          providerChargeId: 'deposit-flw-1',
          currency: 'NGN',
          usdAmount: { toString: () => '10' },
          tokenAmount: 100,
          status: 'pending',
          wallet: { user: { id: 'user-1', referredById: null } },
        }),
      },
      referralSettings: {
        upsert: jest
          .fn()
          .mockResolvedValue({ fundingBonusEnabled: false, fundingBonusRate: { gt: () => false } }),
      },
      distributorSettings: {
        upsert: jest.fn().mockResolvedValue({
          enabled: false,
          multiLevelReferralEnabled: false,
          maxReferralDepth: 0,
        }),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: 'user-1', referredById: null }),
      },
    };
    prisma.$transaction = jest.fn(async (input: unknown) => {
      if (typeof input === 'function') return (input as (tx: unknown) => unknown)(tx);
      return Promise.all(input as Promise<unknown>[]);
    });
    const flutterwave = {
      verifyWebhookSignature: jest.fn().mockReturnValue(true),
      getWebhookEventHash: jest.fn().mockReturnValue('fw-event-hash'),
    };
    const controller = new WalletController(
      prisma as never,
      {} as never,
      flutterwave as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return { controller, prisma, tx, flutterwave };
  }

  it('credits a successful charge in one atomic transaction', async () => {
    const { controller, prisma, tx } = setup();
    const req = chargeCompletedRequest();

    await expect(controller.handleFlutterwaveWebhook(req)).resolves.toEqual({
      received: true,
      credited: true,
      status: 'successful',
    });
    expect(prisma.deposit.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { providerChargeId: 'deposit-flw-1' } }),
    );
    expect(tx.deposit.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'deposit-1', status: { not: 'confirmed' } } }),
    );
    expect(tx.ledgerEntry.create).toHaveBeenCalledTimes(1);
    expect(tx.wallet.update).toHaveBeenCalledTimes(1);
  });

  it('rejects a request with no raw body before touching the database', async () => {
    const { controller, prisma } = setup();
    const req = {
      ...chargeCompletedRequest(),
      rawBody: undefined,
    } as unknown as Parameters<WalletController['handleFlutterwaveWebhook']>[0];

    await expect(controller.handleFlutterwaveWebhook(req)).rejects.toThrow(
      'Missing raw request body',
    );
    expect(prisma.flutterwaveWebhookEvent.upsert).not.toHaveBeenCalled();
  });

  it('rejects an invalid signature before persistence', async () => {
    const { controller, prisma, flutterwave } = setup();
    flutterwave.verifyWebhookSignature.mockReturnValue(false);

    await expect(controller.handleFlutterwaveWebhook(chargeCompletedRequest())).rejects.toThrow(
      'Invalid webhook signature',
    );
    expect(prisma.flutterwaveWebhookEvent.upsert).not.toHaveBeenCalled();
  });

  it('acknowledges an already processed duplicate without touching the deposit', async () => {
    const { controller, prisma } = setup({ processedAt: new Date() });

    await expect(controller.handleFlutterwaveWebhook(chargeCompletedRequest())).resolves.toEqual({
      received: true,
      duplicate: true,
    });
    expect(prisma.deposit.findUnique).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('does not credit a non-successful charge status', async () => {
    const { controller, prisma, tx } = setup();

    await expect(
      controller.handleFlutterwaveWebhook(chargeCompletedRequest({ status: 'failed' })),
    ).resolves.toEqual({ received: true, matched: false });
    expect(prisma.deposit.findUnique).not.toHaveBeenCalled();
    expect(tx.ledgerEntry.create).not.toHaveBeenCalled();
  });

  it('acknowledges without crediting when no deposit matches the tx_ref', async () => {
    const { controller, prisma, tx } = setup();
    prisma.deposit.findUnique.mockResolvedValue(null);

    await expect(controller.handleFlutterwaveWebhook(chargeCompletedRequest())).resolves.toEqual({
      received: true,
      matched: false,
    });
    expect(tx.ledgerEntry.create).not.toHaveBeenCalled();
  });

  it('ignores unrecognized event types', async () => {
    const { controller, prisma } = setup();
    const req = chargeCompletedRequest({}, { event: 'subscription.cancelled' });

    await expect(controller.handleFlutterwaveWebhook(req)).resolves.toEqual({
      received: true,
      matched: false,
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('routes transfer.completed events to the payout webhook path and updates the matching withdrawal', async () => {
    const transferBody = {
      event: 'transfer.completed',
      data: { id: 55, reference: 'withdrawal-1', status: 'SUCCESSFUL' },
    };
    const transferRawBody = Buffer.from(JSON.stringify(transferBody));
    const prisma: any = {
      flutterwavePayoutEvent: {
        upsert: jest.fn().mockResolvedValue({ id: 'fw-payout-event-1' }),
        update: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockResolvedValue({}),
      },
      withdrawalRequest: {
        findUnique: jest.fn().mockResolvedValue({ id: 'withdrawal-1', providerPayoutId: '55' }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    prisma.$transaction = jest.fn(async (input: unknown) => {
      if (typeof input === 'function') return (input as (tx: unknown) => unknown)(prisma);
      return Promise.all(input as Promise<unknown>[]);
    });
    const flutterwave = { verifyWebhookSignature: jest.fn().mockReturnValue(true), getWebhookEventHash: jest.fn().mockReturnValue('transfer-event-hash') };
    const controller = new WalletController(
      prisma as never,
      {} as never,
      flutterwave as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const req = {
      rawBody: transferRawBody,
      body: transferBody,
      headers: { 'verif-hash': 'valid-hash' },
    } as unknown as Parameters<WalletController['handleFlutterwaveWebhook']>[0];

    await expect(controller.handleFlutterwaveWebhook(req)).resolves.toEqual({
      received: true,
      status: 'successful',
    });
    expect(prisma.withdrawalRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'withdrawal-1' },
        data: expect.objectContaining({ status: 'PAID' }),
      }),
    );
  });
});

describe('WalletController withdrawal payout automation', () => {
  const decimal = (value: number) => ({ toNumber: () => value, toString: () => String(value) });

  function baseWithdrawal(overrides: Record<string, unknown> = {}) {
    return {
      id: 'withdrawal-1',
      walletId: 'wallet-1',
      tokenAmount: decimal(100),
      usdtAmount: decimal(10),
      destinationAddress: 'TAddress123',
      destinationCurrency: 'USDT',
      destinationNetwork: 'TRC20',
      status: 'PENDING',
      providerPayoutId: null,
      ...overrides,
    };
  }

  function setup(withdrawal: Record<string, unknown>) {
    const prisma: any = {
      withdrawalRequest: {
        findUnique: jest.fn().mockResolvedValue(withdrawal),
        findUniqueOrThrow: jest.fn().mockResolvedValue(withdrawal),
        update: jest
          .fn()
          .mockImplementation(({ data }: { data: Record<string, unknown> }) =>
            Promise.resolve({ ...withdrawal, ...data }),
          ),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      user: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'admin-1', email: 'admin@x.com' }),
      },
      nowPaymentsPayoutEvent: { create: jest.fn().mockResolvedValue({}) },
      wallet: { update: jest.fn().mockResolvedValue({}) },
      ledgerEntry: { create: jest.fn().mockResolvedValue({}) },
    };
    prisma.$transaction = jest.fn(async (input: unknown) => {
      if (typeof input === 'function') return (input as (tx: unknown) => unknown)(prisma);
      return Promise.all(input as Promise<unknown>[]);
    });
    const nowPayments = {
      createPayout: jest
        .fn()
        .mockResolvedValue({ payoutId: 'payout-1', status: 'processing', raw: {} }),
      getPayoutStatus: jest
        .fn()
        .mockResolvedValue({ payoutId: 'payout-1', status: 'processing', raw: {} }),
      verifyPayout: jest
        .fn()
        .mockResolvedValue({ payoutId: 'payout-1', status: 'processing', raw: {} }),
    };
    const platformSettings = {
      isNowPaymentsPayoutsEnabled: jest.fn().mockResolvedValue(true),
      isAdminPayoutOtpEnabled: jest.fn().mockResolvedValue(false),
      isAutoSubmitAfterApprovalEnabled: jest.fn().mockResolvedValue(false),
    };
    const otp = { verify: jest.fn().mockResolvedValue({}), issueForUser: jest.fn() };
    const controller = new WalletController(
      prisma as never,
      nowPayments as never,
      {} as never,
      platformSettings as never,
      otp as never,
      {} as never,
    );
    const req = { user: { sub: 'admin-1' } } as never;
    return { controller, prisma, nowPayments, platformSettings, otp, req };
  }

  it('does not call createPayout again when the withdrawal already has a providerPayoutId (idempotency)', async () => {
    const { controller, nowPayments } = setup(
      baseWithdrawal({ status: 'APPROVED', providerPayoutId: 'payout-1' }),
    );

    await controller.submitWithdrawalToNowPayments(
      { user: { sub: 'admin-1' } } as never,
      'withdrawal-1',
      {},
    );

    expect(nowPayments.createPayout).not.toHaveBeenCalled();
    expect(nowPayments.getPayoutStatus).toHaveBeenCalledWith('payout-1');
  });

  it('refuses to submit a FAILED withdrawal directly -- it must be re-approved first', async () => {
    const { controller, nowPayments } = setup(baseWithdrawal({ status: 'FAILED' }));

    await expect(
      controller.submitWithdrawalToNowPayments(
        { user: { sub: 'admin-1' } } as never,
        'withdrawal-1',
        {},
      ),
    ).rejects.toThrow('Only approved withdrawals can be submitted to NOWPayments');
    expect(nowPayments.createPayout).not.toHaveBeenCalled();
  });

  it('refuses to submit a PENDING withdrawal that has not been approved yet', async () => {
    const { controller, nowPayments } = setup(baseWithdrawal({ status: 'PENDING' }));

    await expect(
      controller.submitWithdrawalToNowPayments(
        { user: { sub: 'admin-1' } } as never,
        'withdrawal-1',
        {},
      ),
    ).rejects.toThrow('Only approved withdrawals can be submitted to NOWPayments');
    expect(nowPayments.createPayout).not.toHaveBeenCalled();
  });

  it('rejects submission when the atomic claim loses a race (concurrent submit calls)', async () => {
    const { controller, prisma, nowPayments } = setup(baseWithdrawal({ status: 'APPROVED' }));
    prisma.withdrawalRequest.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      controller.submitWithdrawalToNowPayments(
        { user: { sub: 'admin-1' } } as never,
        'withdrawal-1',
        {},
      ),
    ).rejects.toThrow('already being submitted or was already submitted');
    expect(nowPayments.createPayout).not.toHaveBeenCalled();
  });

  it('submits to NOWPayments once the claim succeeds for an APPROVED withdrawal', async () => {
    const { controller, nowPayments, prisma } = setup(baseWithdrawal({ status: 'APPROVED' }));

    const result = await controller.submitWithdrawalToNowPayments(
      { user: { sub: 'admin-1' } } as never,
      'withdrawal-1',
      {},
    );

    expect(nowPayments.createPayout).toHaveBeenCalledWith(
      expect.objectContaining({ withdrawalId: 'withdrawal-1', currency: 'USDT', amount: 10 }),
    );
    expect(prisma.withdrawalRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'withdrawal-1', status: 'APPROVED', providerPayoutId: null },
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({ withdrawalId: 'withdrawal-1', providerPayoutId: 'payout-1' }),
    );
  });

  it('marks a withdrawal FAILED (not APPROVED) when createPayout throws, without refunding automatically', async () => {
    const { controller, prisma } = setup(baseWithdrawal({ status: 'APPROVED' }));
    const nowPayments = {
      createPayout: jest.fn().mockRejectedValue(new Error('provider unreachable')),
      getPayoutStatus: jest.fn(),
      verifyPayout: jest.fn(),
    };
    const platformSettings = {
      isNowPaymentsPayoutsEnabled: jest.fn().mockResolvedValue(true),
      isAdminPayoutOtpEnabled: jest.fn().mockResolvedValue(false),
    };
    const otp = { verify: jest.fn(), issueForUser: jest.fn() };
    const controllerWithFailingProvider = new WalletController(
      prisma as never,
      nowPayments as never,
      {} as never,
      platformSettings as never,
      otp as never,
      {} as never,
    );

    await expect(
      controllerWithFailingProvider.submitWithdrawalToNowPayments(
        { user: { sub: 'admin-1' } } as never,
        'withdrawal-1',
        {},
      ),
    ).rejects.toThrow('provider unreachable');

    expect(prisma.withdrawalRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }),
    );
    expect(prisma.wallet.update).not.toHaveBeenCalled();
    expect(prisma.ledgerEntry.create).not.toHaveBeenCalled();
    void controller;
  });

  it('approve requires PENDING status and records approvedByAdminId/approvedAt', async () => {
    const { controller, prisma, req } = setup(baseWithdrawal({ status: 'PENDING' }));

    const result = await controller.approveWithdrawal(req, 'withdrawal-1', {});

    expect(prisma.withdrawalRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'APPROVED', approvedByAdminId: 'admin-1' }),
      }),
    );
    expect(result.status).toBe('APPROVED');
  });

  it('approve refuses a withdrawal that is not PENDING', async () => {
    const { controller, req } = setup(baseWithdrawal({ status: 'APPROVED' }));

    await expect(controller.approveWithdrawal(req, 'withdrawal-1', {})).rejects.toThrow(
      'Only pending withdrawals can be approved',
    );
  });

  it('resolve(reject) refunds tokens exactly once via a single WITHDRAWAL_REVERSED ledger entry', async () => {
    const { controller, prisma, req } = setup(baseWithdrawal({ status: 'PENDING' }));

    const result = await controller.resolveWithdrawal(req, 'withdrawal-1', {
      outcome: 'rejected',
    } as never);

    expect(prisma.ledgerEntry.create).toHaveBeenCalledTimes(1);
    expect(prisma.ledgerEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'WITHDRAWAL_REVERSED', reference: 'withdrawal-1' }),
      }),
    );
    expect(prisma.wallet.update).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ withdrawalId: 'withdrawal-1', status: 'rejected' });
  });

  it('resolve refuses to re-resolve an already-terminal withdrawal (no double refund)', async () => {
    const { controller, prisma, req } = setup(baseWithdrawal({ status: 'PAID' }));

    await expect(
      controller.resolveWithdrawal(req, 'withdrawal-1', { outcome: 'rejected' } as never),
    ).rejects.toThrow('Withdrawal request already resolved');
    expect(prisma.ledgerEntry.create).not.toHaveBeenCalled();
  });

  it('resolve refuses to mark a FAILED withdrawal paid manually without reconciliation', async () => {
    const { controller, req } = setup(baseWithdrawal({ status: 'FAILED' }));

    await expect(
      controller.resolveWithdrawal(req, 'withdrawal-1', { outcome: 'paid' } as never),
    ).rejects.toThrow('must be reconciled');
  });

  it('the admin OTP context hash binds amount/currency/address/network, not just id', async () => {
    const { controller, otp, platformSettings, req } = setup(baseWithdrawal({ status: 'PENDING' }));
    platformSettings.isAdminPayoutOtpEnabled.mockResolvedValue(true);

    await controller.approveWithdrawal(req, 'withdrawal-1', {
      otpRequestId: 'otp-1',
      code: '123456',
    });

    expect(otp.verify).toHaveBeenCalledWith(
      expect.objectContaining({
        contextHash: expect.any(String),
      }),
    );
    const [[call]] = otp.verify.mock.calls;
    expect(typeof call.contextHash).toBe('string');
    expect(call.contextHash.length).toBeGreaterThan(0);
  });
});

describe('WalletController Flutterwave payout submission', () => {
  const decimal = (value: number) => ({ toNumber: () => value, toString: () => String(value) });

  beforeEach(() => {
    process.env.PAYOUT_ACCOUNT_ENCRYPTION_KEY = 'test-payout-encryption-key';
  });
  afterEach(() => {
    delete process.env.PAYOUT_ACCOUNT_ENCRYPTION_KEY;
  });

  function encryptedAccountNumberFixture() {
    return encryptPayoutField('0690000032');
  }

  function baseFiatWithdrawal(overrides: Record<string, unknown> = {}) {
    return {
      id: 'withdrawal-1',
      walletId: 'wallet-1',
      tokenAmount: decimal(100),
      usdtAmount: decimal(10),
      destinationAddress: '',
      destinationCurrency: 'NGN',
      destinationNetwork: '',
      payoutMethod: 'BANK',
      destinationBankCode: '044',
      destinationBankName: 'Access Bank',
      destinationAccountNumberEncryptedJson: encryptedAccountNumberFixture(),
      destinationAccountNumberMasked: '****1234',
      destinationAccountName: 'John Doe',
      status: 'PENDING',
      providerPayoutId: null,
      ...overrides,
    };
  }

  function setup(withdrawal: Record<string, unknown>) {
    const prisma: any = {
      withdrawalRequest: {
        findUnique: jest.fn().mockResolvedValue(withdrawal),
        findUniqueOrThrow: jest.fn().mockResolvedValue(withdrawal),
        update: jest
          .fn()
          .mockImplementation(({ data }: { data: Record<string, unknown> }) =>
            Promise.resolve({ ...withdrawal, ...data }),
          ),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      flutterwavePayoutEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    prisma.$transaction = jest.fn(async (input: unknown) => {
      if (typeof input === 'function') return (input as (tx: unknown) => unknown)(prisma);
      return Promise.all(input as Promise<unknown>[]);
    });
    const flutterwave = {
      resolveAccount: jest.fn().mockResolvedValue({ accountNumber: '0690000032', accountName: 'John Doe' }),
      createTransfer: jest
        .fn()
        .mockResolvedValue({ transferId: 'transfer-1', status: 'NEW', raw: {} }),
      getTransferStatus: jest
        .fn()
        .mockResolvedValue({ transferId: 'transfer-1', status: 'NEW', raw: {} }),
    };
    const platformSettings = {
      isFlutterwavePayoutsEnabled: jest.fn().mockResolvedValue(true),
      isAdminPayoutOtpEnabled: jest.fn().mockResolvedValue(false),
    };
    const otp = { verify: jest.fn().mockResolvedValue({}) };
    const controller = new WalletController(
      prisma as never,
      {} as never,
      flutterwave as never,
      platformSettings as never,
      otp as never,
      {} as never,
    );
    const req = { user: { sub: 'admin-1' } } as never;
    return { controller, prisma, flutterwave, platformSettings, otp, req };
  }

  it('resolves the account before transferring and proceeds when the name matches', async () => {
    const { controller, flutterwave, req } = setup(baseFiatWithdrawal({ status: 'APPROVED' }));

    const result = await controller.submitWithdrawalToFlutterwave(req, 'withdrawal-1', {});

    expect(flutterwave.resolveAccount).toHaveBeenCalledWith({
      accountBank: '044',
      accountNumber: expect.any(String),
    });
    expect(flutterwave.createTransfer).toHaveBeenCalledWith(
      expect.objectContaining({ accountBank: '044', currency: 'NGN', reference: 'withdrawal-1' }),
    );
    expect(result).toMatchObject({ withdrawalId: 'withdrawal-1', providerPayoutId: 'transfer-1' });
  });

  it('refuses to transfer when the resolved account name no longer matches the saved snapshot', async () => {
    const { controller, flutterwave, req } = setup(baseFiatWithdrawal({ status: 'APPROVED' }));
    flutterwave.resolveAccount.mockResolvedValue({
      accountNumber: '0690000032',
      accountName: 'Someone Else',
    });

    await expect(
      controller.submitWithdrawalToFlutterwave(req, 'withdrawal-1', {}),
    ).rejects.toThrow('no longer matches');
    expect(flutterwave.createTransfer).not.toHaveBeenCalled();
  });

  it('refuses to submit a FAILED withdrawal directly -- it must be re-approved first', async () => {
    const { controller, flutterwave, req } = setup(baseFiatWithdrawal({ status: 'FAILED' }));

    await expect(
      controller.submitWithdrawalToFlutterwave(req, 'withdrawal-1', {}),
    ).rejects.toThrow('Only approved withdrawals can be submitted to Flutterwave');
    expect(flutterwave.createTransfer).not.toHaveBeenCalled();
  });

  it('does not call createTransfer again when the withdrawal already has a providerPayoutId', async () => {
    const { controller, flutterwave, req } = setup(
      baseFiatWithdrawal({ status: 'APPROVED', providerPayoutId: 'transfer-1' }),
    );

    await controller.submitWithdrawalToFlutterwave(req, 'withdrawal-1', {});

    expect(flutterwave.createTransfer).not.toHaveBeenCalled();
    expect(flutterwave.getTransferStatus).toHaveBeenCalledWith('transfer-1');
  });

  it('rejects submission when the atomic claim loses a race (concurrent submit calls)', async () => {
    const { controller, prisma, flutterwave, req } = setup(
      baseFiatWithdrawal({ status: 'APPROVED' }),
    );
    prisma.withdrawalRequest.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      controller.submitWithdrawalToFlutterwave(req, 'withdrawal-1', {}),
    ).rejects.toThrow('already being submitted');
    expect(flutterwave.createTransfer).not.toHaveBeenCalled();
  });

  it('marks the withdrawal FAILED (does not throw a lost update) when createTransfer rejects', async () => {
    const { controller, prisma, flutterwave, req } = setup(baseFiatWithdrawal({ status: 'APPROVED' }));
    flutterwave.createTransfer.mockRejectedValue(new Error('provider unreachable'));

    await expect(controller.submitWithdrawalToFlutterwave(req, 'withdrawal-1', {})).rejects.toThrow(
      'provider unreachable',
    );
    expect(prisma.withdrawalRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }),
    );
  });

  it('refresh-flutterwave maps a SUCCESSFUL transfer status to PAID', async () => {
    const { controller, prisma, flutterwave } = setup(
      baseFiatWithdrawal({ status: 'PROCESSING', providerPayoutId: 'transfer-1' }),
    );
    flutterwave.getTransferStatus.mockResolvedValue({
      transferId: 'transfer-1',
      status: 'SUCCESSFUL',
      raw: {},
    });

    const result = await controller.refreshFlutterwaveWithdrawalStatus('withdrawal-1');

    expect(result.status).toBe('PAID');
    expect(prisma.withdrawalRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PAID' }) }),
    );
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
    const controller = new WalletController(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      controller.listEarnings({ user: { sub: 'user-1' } } as never, { page: 2, pageSize: 10 }),
    ).resolves.toEqual({
      items: [{ ...entries[0], amount: '25.5' }],
      page: 2,
      pageSize: 10,
      total: 11,
      totalPages: 2,
    });
    expect(prisma.ledgerEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 10,
        take: 10,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
    );
  });
});

describe('WalletController admin leaderboard', () => {
  it('ranks earners by task payout ledger totals and contributors by submitted task count', async () => {
    const prisma = {
      ledgerEntry: {
        // Already in the order Postgres's orderBy: { _sum: { amount: 'desc' } }
        // would return -- the controller no longer re-sorts this in JS.
        groupBy: jest.fn().mockResolvedValue([
          { walletId: 'wallet-high', _sum: { amount: 30 }, _count: { _all: 2 } },
          { walletId: 'wallet-low', _sum: { amount: 12 }, _count: { _all: 1 } },
        ]),
      },
      wordRecording: {
        groupBy: jest.fn().mockResolvedValue([
          { userId: 'user-a', _count: { _all: 2 } },
          { userId: 'user-b', _count: { _all: 4 } },
        ]),
      },
      submission: {
        groupBy: jest.fn().mockResolvedValue([
          { userId: 'user-a', _count: { _all: 5 } },
          { userId: null, _count: { _all: 99 } },
        ]),
      },
      wallet: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'wallet-high',
            user: {
              id: 'earner-high',
              firstName: 'High',
              lastName: 'Earner',
              email: 'high@example.com',
              role: 'TRAINER',
            },
          },
          {
            id: 'wallet-low',
            user: {
              id: 'earner-low',
              firstName: 'Low',
              lastName: 'Earner',
              email: 'low@example.com',
              role: 'TRAINER',
            },
          },
        ]),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'user-a',
            firstName: 'Ada',
            lastName: 'Tasks',
            email: 'ada@example.com',
            role: 'TRAINER',
          },
          {
            id: 'user-b',
            firstName: 'Ben',
            lastName: 'Words',
            email: 'ben@example.com',
            role: 'TRAINER',
          },
        ]),
      },
    };
    const controller = new WalletController(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(controller.getAdminLeaderboard()).resolves.toEqual({
      topEarners: [
        {
          user: {
            id: 'earner-high',
            firstName: 'High',
            lastName: 'Earner',
            email: 'high@example.com',
            role: 'TRAINER',
          },
          totalEarned: '30',
          payoutCount: 2,
        },
        {
          user: {
            id: 'earner-low',
            firstName: 'Low',
            lastName: 'Earner',
            email: 'low@example.com',
            role: 'TRAINER',
          },
          totalEarned: '12',
          payoutCount: 1,
        },
      ],
      topContributors: [
        {
          user: {
            id: 'user-a',
            firstName: 'Ada',
            lastName: 'Tasks',
            email: 'ada@example.com',
            role: 'TRAINER',
          },
          totalTasks: 7,
          wordRecordings: 2,
          submissions: 5,
        },
        {
          user: {
            id: 'user-b',
            firstName: 'Ben',
            lastName: 'Words',
            email: 'ben@example.com',
            role: 'TRAINER',
          },
          totalTasks: 4,
          wordRecordings: 4,
          submissions: 0,
        },
      ],
    });
    expect(prisma.ledgerEntry.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { type: 'TRAINING_PAYOUT', amount: { gt: 0 } },
        orderBy: { _sum: { amount: 'desc' } },
        take: 10,
      }),
    );
  });
});

describe('WalletController paginated leaderboard', () => {
  function setup() {
    const prisma = {
      ledgerEntry: {
        groupBy: jest.fn().mockResolvedValue([
          { walletId: 'wallet-1', _sum: { amount: 30 }, _count: { _all: 2 } },
          { walletId: 'wallet-2', _sum: { amount: 20 }, _count: { _all: 1 } },
          { walletId: 'wallet-3', _sum: { amount: 10 }, _count: { _all: 1 } },
        ]),
      },
      wordRecording: {
        groupBy: jest.fn().mockResolvedValue([{ userId: 'user-1', _count: { _all: 3 } }]),
      },
      submission: {
        groupBy: jest.fn().mockResolvedValue([{ userId: 'user-2', _count: { _all: 5 } }]),
      },
      wallet: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'wallet-1',
            user: {
              id: 'user-1',
              firstName: 'A',
              lastName: 'One',
              email: 'a@example.com',
              role: 'TRAINER',
            },
          },
          {
            id: 'wallet-2',
            user: {
              id: 'user-2',
              firstName: 'B',
              lastName: 'Two',
              email: 'b@example.com',
              role: 'TRAINER',
            },
          },
          {
            id: 'wallet-3',
            user: {
              id: 'user-3',
              firstName: 'C',
              lastName: 'Three',
              email: 'c@example.com',
              role: 'TRAINER',
            },
          },
        ]),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'user-1',
            firstName: 'A',
            lastName: 'One',
            email: 'a@example.com',
            role: 'TRAINER',
          },
          {
            id: 'user-2',
            firstName: 'B',
            lastName: 'Two',
            email: 'b@example.com',
            role: 'TRAINER',
          },
        ]),
      },
    };
    const controller = new WalletController(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return { controller, prisma };
  }

  it('paginates earners, ranking against LEADERBOARD_MAX_ROWS not just the top 10', async () => {
    const { controller, prisma } = setup();

    const page1 = await controller.getAdminLeaderboardEarners({ page: 1, pageSize: 2 });
    expect(page1).toEqual({
      items: [
        { user: expect.objectContaining({ id: 'user-1' }), totalEarned: '30', payoutCount: 2 },
        { user: expect.objectContaining({ id: 'user-2' }), totalEarned: '20', payoutCount: 1 },
      ],
      page: 1,
      pageSize: 2,
      total: 3,
      totalPages: 2,
    });
    expect(prisma.ledgerEntry.groupBy).toHaveBeenCalledWith(expect.objectContaining({ take: 200 }));

    const page2 = await controller.getAdminLeaderboardEarners({ page: 2, pageSize: 2 });
    expect(page2.items).toEqual([
      { user: expect.objectContaining({ id: 'user-3' }), totalEarned: '10', payoutCount: 1 },
    ]);
  });

  it('paginates contributors ranked by word recordings + submissions', async () => {
    const { controller } = setup();

    const page1 = await controller.getAdminLeaderboardContributors({ page: 1, pageSize: 1 });
    expect(page1).toEqual({
      items: [
        {
          user: expect.objectContaining({ id: 'user-2' }),
          totalTasks: 5,
          wordRecordings: 0,
          submissions: 5,
        },
      ],
      page: 1,
      pageSize: 1,
      total: 2,
      totalPages: 2,
    });

    const page2 = await controller.getAdminLeaderboardContributors({ page: 2, pageSize: 1 });
    expect(page2.items).toEqual([
      {
        user: expect.objectContaining({ id: 'user-1' }),
        totalTasks: 3,
        wordRecordings: 3,
        submissions: 0,
      },
    ]);
  });
});

describe('WalletController admin training payouts', () => {
  function setup() {
    (creditAdminFunding as jest.Mock).mockReset().mockResolvedValue({
      userId: 'trainer-1',
      reference: 'ref-1',
      amount: '10',
    });
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ email: 'trainer@x.com' }) },
    };
    const platformSettings = { isAdminPayoutOtpEnabled: jest.fn().mockResolvedValue(false) };
    const mail = { sendTrainingPayoutCreditedEmail: jest.fn().mockResolvedValue(undefined) };
    const controller = new WalletController(
      prisma as never,
      {} as never,
      {} as never,
      platformSettings as never,
      {} as never,
      mail as never,
    );
    return { controller, prisma, mail };
  }

  it('returns the funding result without waiting on the notification email', async () => {
    const { controller, mail, prisma } = setup();

    const result = await controller.createTrainingPayout(
      { user: { sub: 'admin-1' } } as never,
      { userId: 'trainer-1', tokenAmount: 10, reference: 'ref-1' } as never,
    );

    expect(result).toEqual(expect.objectContaining({ amount: '10' }));
    expect(creditAdminFunding).toHaveBeenCalledWith(prisma, 'trainer-1', 10, 'ref-1');
    // Email dispatch is fire-and-forget (void promise chain) -- give the
    // microtask queue a tick so the .then() has a chance to run before
    // asserting on it, without making the endpoint itself await it.
    await new Promise((resolve) => setImmediate(resolve));
    expect(mail.sendTrainingPayoutCreditedEmail).toHaveBeenCalledWith({
      trainerEmail: 'trainer@x.com',
      tokenAmount: '10',
      reference: 'ref-1',
    });
  });

  it('does not let a failed notification email affect the response', async () => {
    const { controller, mail, prisma } = setup();
    prisma.user.findUnique = jest.fn().mockRejectedValue(new Error('db hiccup'));

    await expect(
      controller.createTrainingPayout(
        { user: { sub: 'admin-1' } } as never,
        { userId: 'trainer-1', tokenAmount: 10, reference: 'ref-1' } as never,
      ),
    ).resolves.toEqual(expect.objectContaining({ amount: '10' }));
    await new Promise((resolve) => setImmediate(resolve));
    expect(mail.sendTrainingPayoutCreditedEmail).not.toHaveBeenCalled();
  });
});

describe('WalletController admin wallet adjustments', () => {
  function setup() {
    (adjustAdminWallet as jest.Mock).mockReset().mockResolvedValue({
      userId: 'trainer-1',
      reference: 'duplicate bonus correction',
      amount: '-5',
      balance: '15',
    });
    const prisma = {
      user: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'admin-1', email: 'admin@x.com' }),
      },
    };
    const platformSettings = { isAdminPayoutOtpEnabled: jest.fn().mockResolvedValue(false) };
    const otp = { verify: jest.fn(), issueForUser: jest.fn() };
    const mail = { sendTrainingPayoutCreditedEmail: jest.fn() };
    const controller = new WalletController(
      prisma as never,
      {} as never,
      {} as never,
      platformSettings as never,
      otp as never,
      mail as never,
    );
    return { controller, prisma, mail };
  }

  it('silently debits a user wallet without sending payout email', async () => {
    const { controller, prisma, mail } = setup();

    const result = await controller.createAdminWalletAdjustment(
      { user: { sub: 'admin-1' } } as never,
      { userId: 'trainer-1', tokenAmount: -5, reference: 'duplicate bonus correction' } as never,
    );

    expect(result).toEqual(expect.objectContaining({ amount: '-5', balance: '15' }));
    expect(adjustAdminWallet).toHaveBeenCalledWith(
      prisma,
      'trainer-1',
      -5,
      'duplicate bonus correction',
    );
    expect(mail.sendTrainingPayoutCreditedEmail).not.toHaveBeenCalled();
  });

  it('maps insufficient balance to a validation error', async () => {
    const { controller } = setup();
    (adjustAdminWallet as jest.Mock).mockRejectedValue(
      new Error('Insufficient wallet balance for this debit'),
    );

    await expect(
      controller.createAdminWalletAdjustment(
        { user: { sub: 'admin-1' } } as never,
        { userId: 'trainer-1', tokenAmount: -500, reference: 'too much' } as never,
      ),
    ).rejects.toThrow('Insufficient wallet balance for this debit');
  });
});

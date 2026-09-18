import { P2PService } from './p2p.service';
import { encryptPayoutField } from '../common/payout-crypto.util';

describe('P2PService.listMyTrades -- seller payment method reveal', () => {
  beforeEach(() => {
    process.env.PAYOUT_ACCOUNT_ENCRYPTION_KEY = 'test-payout-encryption-key';
  });
  afterEach(() => {
    delete process.env.PAYOUT_ACCOUNT_ENCRYPTION_KEY;
  });

  const decimal = (value: number) => ({ toString: () => String(value) });

  function makeTrade(overrides: Record<string, unknown> = {}) {
    return {
      id: 'trade-1',
      offerId: 'offer-1',
      offer: { type: 'SELL' },
      buyerId: 'buyer-1',
      sellerId: 'seller-1',
      buyer: {
        id: 'buyer-1',
        email: 'buyer@example.com',
        firstName: null,
        lastName: null,
        phoneNumber: '+15550001111',
      },
      seller: {
        id: 'seller-1',
        email: 'seller@example.com',
        firstName: null,
        lastName: null,
        phoneNumber: '+15550002222',
        p2pPaymentInstructions: null,
      },
      tokenAmount: decimal(100),
      usdAmount: decimal(10),
      fiatAmount: decimal(5000),
      fiatCurrency: 'NGN',
      paymentMethod: 'BANK_TRANSFER',
      sellerPaymentMethod: {
        type: 'BANK',
        bankCode: '044',
        bankName: 'Access Bank',
        accountName: 'Ada Lovelace',
        accountNumberMasked: '****1234',
        accountNumberEncryptedJson: encryptPayoutField('0691234567'),
        mobileMoneyNetwork: null,
        mobileMoneyNumberMasked: null,
        mobileMoneyNumberEncryptedJson: null,
      },
      status: 'AWAITING_PAYMENT',
      paymentDeadlineAt: new Date(),
      cancelRequestedByUserId: null,
      cancelAvailableAt: null,
      paidAt: null,
      releasedAt: null,
      cancelledAt: null,
      disputedAt: null,
      dispute: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  function setup(trade: unknown) {
    const prisma = {
      p2PTokenTrade: { findMany: jest.fn().mockResolvedValue([trade]) },
    };
    const service = new P2PService(prisma as never, {} as never, {} as never, {} as never);
    jest.spyOn(service as any, 'expireStaleRecords').mockResolvedValue(undefined);
    return { service, prisma };
  }

  it('reveals the real, decrypted account number to a trade participant, alongside the masked fallback', async () => {
    const { service } = setup(makeTrade());
    const [result] = await service.listMyTrades('buyer-1', {} as any);

    expect(result.sellerPaymentMethod).toMatchObject({
      accountNumber: '0691234567',
      accountNumberMasked: '****1234',
    });
    // Raw encrypted blob must never leave the backend.
    expect(result.sellerPaymentMethod).not.toHaveProperty('accountNumberEncryptedJson');
  });

  it('reveals it to the seller too, not just the buyer', async () => {
    const { service } = setup(makeTrade());
    const [result] = await service.listMyTrades('seller-1', {} as any);
    expect(result.sellerPaymentMethod?.accountNumber).toBe('0691234567');
  });

  it('never reveals it to a non-participant', async () => {
    const { service } = setup(makeTrade());
    const [result] = await service.listMyTrades('some-other-user', {} as any);
    expect(result.sellerPaymentMethod).toBeNull();
  });

  it('falls back to null (never throws) when decryption fails, leaving the masked field intact', async () => {
    const trade = makeTrade({
      sellerPaymentMethod: {
        type: 'BANK',
        bankCode: '044',
        bankName: 'Access Bank',
        accountName: 'Ada Lovelace',
        accountNumberMasked: '****1234',
        accountNumberEncryptedJson: { encryptedValue: 'corrupt', iv: 'bad', authTag: 'bad' },
        mobileMoneyNetwork: null,
        mobileMoneyNumberMasked: null,
        mobileMoneyNumberEncryptedJson: null,
      },
    });
    const { service } = setup(trade);
    const [result] = await service.listMyTrades('buyer-1', {} as any);

    expect(result.sellerPaymentMethod).toMatchObject({
      accountNumber: null,
      accountNumberMasked: '****1234',
    });
  });

  it('reveals the mobile money number the same way for a MOBILE_MONEY seller account', async () => {
    const trade = makeTrade({
      sellerPaymentMethod: {
        type: 'MOBILE_MONEY',
        bankCode: null,
        bankName: null,
        accountName: 'Ada Lovelace',
        accountNumberMasked: null,
        accountNumberEncryptedJson: null,
        mobileMoneyNetwork: 'MTN',
        mobileMoneyNumberMasked: '****5678',
        mobileMoneyNumberEncryptedJson: encryptPayoutField('08012345678'),
      },
    });
    const { service } = setup(trade);
    const [result] = await service.listMyTrades('buyer-1', {} as any);

    expect(result.sellerPaymentMethod).toMatchObject({
      mobileMoneyNumber: '08012345678',
      mobileMoneyNumberMasked: '****5678',
    });
  });
});

describe('P2PService.listMyTrades -- counterparty phone number reveal (WhatsApp click-to-chat)', () => {
  function makeTrade(overrides: Record<string, unknown> = {}) {
    return {
      id: 'trade-1',
      offerId: 'offer-1',
      offer: { type: 'SELL' },
      buyerId: 'buyer-1',
      sellerId: 'seller-1',
      buyer: {
        id: 'buyer-1',
        email: 'buyer@example.com',
        firstName: 'Ada',
        lastName: 'Lovelace',
        phoneNumber: '+15550001111',
      },
      seller: {
        id: 'seller-1',
        email: 'seller@example.com',
        firstName: 'Grace',
        lastName: 'Hopper',
        phoneNumber: '+15550002222',
        p2pPaymentInstructions: null,
      },
      tokenAmount: { toString: () => '100' },
      usdAmount: { toString: () => '10' },
      fiatAmount: { toString: () => '5000' },
      fiatCurrency: 'NGN',
      paymentMethod: 'BANK_TRANSFER',
      sellerPaymentMethod: null,
      status: 'AWAITING_PAYMENT',
      paymentDeadlineAt: new Date(),
      cancelRequestedByUserId: null,
      cancelAvailableAt: null,
      paidAt: null,
      releasedAt: null,
      cancelledAt: null,
      disputedAt: null,
      dispute: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  function setup(trade: unknown) {
    const prisma = { p2PTokenTrade: { findMany: jest.fn().mockResolvedValue([trade]) } };
    const service = new P2PService(prisma as never, {} as never, {} as never, {} as never);
    jest.spyOn(service as any, 'expireStaleRecords').mockResolvedValue(undefined);
    return { service, prisma };
  }

  it('reveals only the SELLER phone number to the buyer, never the buyer their own number back', async () => {
    const { service } = setup(makeTrade());
    const [result] = await service.listMyTrades('buyer-1', {} as any);

    expect(result.seller.phoneNumber).toBe('+15550002222');
    expect(result.buyer.phoneNumber).toBeNull();
  });

  it('reveals only the BUYER phone number to the seller, never the seller their own number back', async () => {
    const { service } = setup(makeTrade());
    const [result] = await service.listMyTrades('seller-1', {} as any);

    expect(result.buyer.phoneNumber).toBe('+15550001111');
    expect(result.seller.phoneNumber).toBeNull();
  });

  it('withholds the phone number entirely when a side never added one', async () => {
    const trade = makeTrade({ seller: { ...makeTrade().seller, phoneNumber: null } });
    const { service } = setup(trade);
    const [result] = await service.listMyTrades('buyer-1', {} as any);

    expect(result.seller.phoneNumber).toBeNull();
  });
});

describe('P2PService.adminListTrades -- counterparty phone number reveal', () => {
  function makeTrade(overrides: Record<string, unknown> = {}) {
    return {
      id: 'trade-1',
      offerId: 'offer-1',
      offer: { type: 'SELL' },
      buyerId: 'buyer-1',
      sellerId: 'seller-1',
      buyer: {
        id: 'buyer-1',
        email: 'buyer@example.com',
        firstName: 'Ada',
        lastName: 'Lovelace',
        phoneNumber: '+15550001111',
      },
      seller: {
        id: 'seller-1',
        email: 'seller@example.com',
        firstName: 'Grace',
        lastName: 'Hopper',
        phoneNumber: '+15550002222',
        p2pPaymentInstructions: null,
      },
      tokenAmount: { toString: () => '100' },
      usdAmount: { toString: () => '10' },
      fiatAmount: { toString: () => '5000' },
      fiatCurrency: 'NGN',
      paymentMethod: 'BANK_TRANSFER',
      sellerPaymentMethod: null,
      status: 'AWAITING_PAYMENT',
      paymentDeadlineAt: new Date(),
      cancelRequestedByUserId: null,
      cancelAvailableAt: null,
      paidAt: null,
      releasedAt: null,
      cancelledAt: null,
      disputedAt: null,
      dispute: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  it('shows both parties phone numbers to an admin (no viewerId is the admin-facing convention)', async () => {
    const prisma = { p2PTokenTrade: { findMany: jest.fn().mockResolvedValue([makeTrade()]) } };
    const service = new P2PService(prisma as never, {} as never, {} as never, {} as never);
    jest.spyOn(service as any, 'expireStaleRecords').mockResolvedValue(undefined);

    const [result] = await service.adminListTrades({} as any);

    expect(result.buyer.phoneNumber).toBe('+15550001111');
    expect(result.seller.phoneNumber).toBe('+15550002222');
  });

  describe('P2PService.adminListDisputes -- defaulter derivation', () => {
    function makeDispute(overrides: Record<string, unknown> = {}) {
      return {
        id: 'dispute-1',
        status: 'OPEN',
        reason: "The buyer didn't send me the money",
        evidenceUrl: null,
        resolutionNote: null,
        createdAt: new Date(),
        resolvedAt: null,
        raisedByUserId: 'seller-1',
        raisedByUser: {
          id: 'seller-1',
          email: 'seller@example.com',
          firstName: 'Grace',
          lastName: 'Hopper',
          phoneNumber: '+15550002222',
        },
        resolvedByAdmin: null,
        trade: makeTrade(),
        ...overrides,
      };
    }

    it('derives the defaulter as the OTHER trade party, not whoever raised the dispute', async () => {
      const prisma = {
        p2PDispute: { findMany: jest.fn().mockResolvedValue([makeDispute()]) },
      };
      const service = new P2PService(prisma as never, {} as never, {} as never, {} as never);

      const [result] = await service.adminListDisputes({} as any);

      // Seller raised it (raisedByUserId: 'seller-1') -- the buyer is the defaulter.
      expect(result.raisedBy.id).toBe('seller-1');
      expect(result.defaulter.id).toBe('buyer-1');
      expect(result.defaulter.email).toBe('buyer@example.com');
    });

    it('derives the defaulter as the seller when the buyer raised the dispute', async () => {
      const prisma = {
        p2PDispute: {
          findMany: jest.fn().mockResolvedValue([
            makeDispute({
              raisedByUserId: 'buyer-1',
              raisedByUser: {
                id: 'buyer-1',
                email: 'buyer@example.com',
                firstName: 'Ada',
                lastName: 'Lovelace',
                phoneNumber: '+15550001111',
              },
            }),
          ]),
        },
      };
      const service = new P2PService(prisma as never, {} as never, {} as never, {} as never);

      const [result] = await service.adminListDisputes({} as any);

      expect(result.raisedBy.id).toBe('buyer-1');
      expect(result.defaulter.id).toBe('seller-1');
      expect(result.defaulter.email).toBe('seller@example.com');
    });

    it("includes the reporter's phone number for the admin WhatsApp deep-link", async () => {
      const prisma = {
        p2PDispute: { findMany: jest.fn().mockResolvedValue([makeDispute()]) },
      };
      const service = new P2PService(prisma as never, {} as never, {} as never, {} as never);

      const [result] = await service.adminListDisputes({} as any);

      expect(result.raisedBy.phoneNumber).toBe('+15550002222');
      expect(result.defaulter.phoneNumber).toBe('+15550001111');
    });
  });
});

describe('P2PService trade-notification SMS', () => {
  const seller = {
    id: 'seller-1',
    phoneNumber: '+2348000000001',
    phoneVerifiedAt: new Date(),
    smsNotificationsEnabled: true,
  };
  const trade = {
    id: 'trade-1',
    buyerId: 'buyer-1',
    sellerId: seller.id,
    status: 'AWAITING_PAYMENT',
    paymentDeadlineAt: new Date(Date.now() + 60_000),
  };

  let prisma: any;
  let otp: any;
  let platformSettings: any;
  let sms: any;
  let service: P2PService;

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn() },
      p2PTokenTrade: {
        findUnique: jest.fn().mockResolvedValue(trade),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue(trade),
      },
      p2PTokenOffer: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn() },
      // expireStaleRecords (called at the top of markPaid) reads the market
      // settings row to get abandonedTradeHours.
      p2PMarketSettings: {
        upsert: jest.fn().mockResolvedValue({ abandonedTradeHours: 48, cancelGraceMinutes: 5 }),
      },
    };
    otp = {};
    platformSettings = {
      isP2pSmsPaymentMarkedEnabled: jest.fn(),
    };
    sms = { sendTransactional: jest.fn().mockResolvedValue(undefined) };
    service = new P2PService(prisma, otp, platformSettings, sms);
    jest.spyOn(service as any, 'getTradeForUser').mockResolvedValue(trade);
  });

  it('sends an SMS to the seller when markPaid succeeds and the toggle is on', async () => {
    platformSettings.isP2pSmsPaymentMarkedEnabled.mockResolvedValue(true);
    prisma.user.findUnique.mockResolvedValue(seller);

    await service.markPaid('buyer-1', trade.id);

    expect(sms.sendTransactional).toHaveBeenCalledWith(
      seller.phoneNumber,
      expect.stringContaining('paid'),
    );
  });

  it('does not send an SMS when the toggle is off', async () => {
    platformSettings.isP2pSmsPaymentMarkedEnabled.mockResolvedValue(false);

    await service.markPaid('buyer-1', trade.id);

    expect(sms.sendTransactional).not.toHaveBeenCalled();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('skips sending when the seller has no verified phone number', async () => {
    platformSettings.isP2pSmsPaymentMarkedEnabled.mockResolvedValue(true);
    prisma.user.findUnique.mockResolvedValue({ ...seller, phoneVerifiedAt: null });

    await service.markPaid('buyer-1', trade.id);

    expect(sms.sendTransactional).not.toHaveBeenCalled();
  });

  it('skips sending when the seller has disabled SMS notifications', async () => {
    platformSettings.isP2pSmsPaymentMarkedEnabled.mockResolvedValue(true);
    prisma.user.findUnique.mockResolvedValue({ ...seller, smsNotificationsEnabled: false });

    await service.markPaid('buyer-1', trade.id);

    expect(sms.sendTransactional).not.toHaveBeenCalled();
  });

  it('does not let a notification failure propagate out of markPaid', async () => {
    platformSettings.isP2pSmsPaymentMarkedEnabled.mockResolvedValue(true);
    prisma.user.findUnique.mockResolvedValue(seller);
    sms.sendTransactional.mockRejectedValue(new Error('SMS delivery is temporarily unavailable'));

    await expect(service.markPaid('buyer-1', trade.id)).resolves.toEqual(trade);
  });

  describe('trade-created payment deadline wording', () => {
    const buyer = {
      id: 'buyer-1',
      phoneNumber: '+2348000000002',
      phoneVerifiedAt: new Date(),
      smsNotificationsEnabled: true,
    };

    async function notify(deadline: Date): Promise<string> {
      platformSettings.isP2pSmsTradeCreatedEnabled = jest.fn().mockResolvedValue(true);
      prisma.user.findUnique.mockResolvedValue(buyer);
      sms.sendTransactional.mockClear();

      // @ts-expect-error -- private method under test
      await service.notifyTradeCreated(buyer.id, seller.id, '37', deadline);

      const call = sms.sendTransactional.mock.calls.find((c: string[]) =>
        c[1].includes('has started'),
      );
      return call[1];
    }

    // Regression: this sent a raw toISOString() -- "Pay before
    // 2026-09-17T10:42:07.237Z" -- which is machine-formatted and, with no
    // timezone stored for the recipient, renders in UTC. A West African
    // trader reads that as roughly an hour out and misses a window only
    // minutes wide. Relative time is correct in every timezone.
    it('states the time remaining, never a raw UTC timestamp', async () => {
      const body = await notify(new Date(Date.now() + 15 * 60_000));

      expect(body).toContain('15 minutes');
      expect(body).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
      expect(body).not.toContain('Z.');
    });

    it('rounds up so it never overstates the time available', async () => {
      // 14m30s left must read as 15, not 14 -- a trader who believes they
      // have less time is safe; one who believes they have more is not.
      const body = await notify(new Date(Date.now() + 14.5 * 60_000));

      expect(body).toContain('15 minutes');
    });

    it('uses the singular at one minute or less', async () => {
      const body = await notify(new Date(Date.now() + 30_000));

      expect(body).toContain('1 minute');
      expect(body).not.toContain('1 minutes');
    });
  });
});

describe('P2PService.listOffers', () => {
  const makeOffer = (overrides: Record<string, unknown> = {}) => ({
    id: 'offer-1',
    type: 'SELL',
    userId: 'trader-1',
    user: {
      id: 'trader-1',
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.com',
      phoneVerifiedAt: new Date(),
      kycStatus: 'APPROVED',
      country: { code: 'NG', name: 'Nigeria' },
    },
    tokenAmount: { toString: () => '100' },
    remainingTokens: { toString: () => '100' },
    usdAmount: { toString: () => '10' },
    fiatAmount: { toString: () => '5000' },
    fiatCurrency: 'NGN',
    paymentMethod: 'BANK_TRANSFER',
    status: 'ACTIVE',
    expiresAt: new Date(),
    completedAt: null,
    cancelledAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  let prisma: any;
  let service: P2PService;

  beforeEach(() => {
    prisma = {
      p2PTokenOffer: {
        findMany: jest.fn().mockResolvedValue([makeOffer()]),
        count: jest.fn().mockResolvedValue(1),
        updateMany: jest.fn(),
      },
      p2PTokenTrade: {
        groupBy: jest.fn().mockResolvedValue([{ sellerId: 'trader-1', _count: { _all: 3 } }]),
      },
      $queryRaw: jest.fn(),
    };
    service = new P2PService(prisma, {} as any, {} as any, {} as any);
    jest.spyOn(service as any, 'expireStaleRecords').mockResolvedValue(undefined);
  });

  it('defaults to ACTIVE status, createdAt desc, page 1 of size 20', async () => {
    const result = await service.listOffers('viewer-1', {
      sortBy: 'createdAt',
      sortDir: 'desc',
      page: 1,
      pageSize: 20,
    } as any);

    expect(prisma.p2PTokenOffer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'ACTIVE' }),
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 20,
      }),
    );
    expect(result).toEqual({
      items: expect.any(Array),
      total: 1,
      page: 1,
      pageSize: 20,
      totalPages: 1,
    });
  });

  it('filters by search across firstName/lastName/email, case-insensitive', async () => {
    await service.listOffers('viewer-1', {
      search: 'ada',
      sortBy: 'createdAt',
      sortDir: 'desc',
      page: 1,
      pageSize: 20,
    } as any);

    expect(prisma.p2PTokenOffer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          user: {
            OR: [
              { firstName: { contains: 'ada', mode: 'insensitive' } },
              { lastName: { contains: 'ada', mode: 'insensitive' } },
              { email: { contains: 'ada', mode: 'insensitive' } },
            ],
          },
        }),
      }),
    );
  });

  it('filters by fiatCurrency and paymentMethod exact match', async () => {
    await service.listOffers('viewer-1', {
      fiatCurrency: 'NGN',
      paymentMethod: 'BANK_TRANSFER',
      sortBy: 'createdAt',
      sortDir: 'desc',
      page: 1,
      pageSize: 20,
    } as any);

    expect(prisma.p2PTokenOffer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ fiatCurrency: 'NGN', paymentMethod: 'BANK_TRANSFER' }),
      }),
    );
  });

  it('filters by token/fiat amount range', async () => {
    await service.listOffers('viewer-1', {
      minTokenAmount: 10,
      maxTokenAmount: 500,
      minFiatAmount: 100,
      sortBy: 'createdAt',
      sortDir: 'desc',
      page: 1,
      pageSize: 20,
    } as any);

    expect(prisma.p2PTokenOffer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tokenAmount: { gte: 10, lte: 500 },
          fiatAmount: { gte: 100 },
        }),
      }),
    );
  });

  it('sorts by tokenAmount ascending', async () => {
    await service.listOffers('viewer-1', {
      sortBy: 'tokenAmount',
      sortDir: 'asc',
      page: 1,
      pageSize: 20,
    } as any);

    expect(prisma.p2PTokenOffer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { tokenAmount: 'asc' } }),
    );
  });

  it('paginates using page/pageSize to compute skip/take', async () => {
    await service.listOffers('viewer-1', {
      sortBy: 'createdAt',
      sortDir: 'desc',
      page: 3,
      pageSize: 10,
    } as any);

    expect(prisma.p2PTokenOffer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 20, take: 10 }),
    );
  });

  it('reports totalPages correctly at a non-exact boundary', async () => {
    prisma.p2PTokenOffer.count.mockResolvedValue(41);

    const result = await service.listOffers('viewer-1', {
      sortBy: 'createdAt',
      sortDir: 'desc',
      page: 1,
      pageSize: 20,
    } as any);

    expect(result.totalPages).toBe(3);
  });

  it('serializes phoneVerified/kycVerified as booleans and never leaks the raw phoneVerifiedAt/kycStatus, plus batches completedSaleCount via a single groupBy', async () => {
    const result = await service.listOffers('viewer-1', {
      sortBy: 'createdAt',
      sortDir: 'desc',
      page: 1,
      pageSize: 20,
    } as any);

    expect(prisma.p2PTokenTrade.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        by: ['sellerId'],
        where: expect.objectContaining({ sellerId: { in: ['trader-1'] }, status: 'RELEASED' }),
      }),
    );
    expect(result.items[0]).toMatchObject({
      completedSaleCount: 3,
      user: {
        id: 'trader-1',
        email: 'ada@example.com',
        firstName: 'Ada',
        lastName: 'Lovelace',
        phoneVerified: true,
        kycVerified: true,
        country: { code: 'NG', name: 'Nigeria' },
      },
    });
    expect(result.items[0].user).not.toHaveProperty('phoneVerifiedAt');
    expect(result.items[0].user).not.toHaveProperty('kycStatus');
  });

  it('reports phoneVerified/kycVerified false and completedSaleCount 0 for a trader with no matching groupBy row', async () => {
    prisma.p2PTokenTrade.groupBy.mockResolvedValue([]);
    prisma.p2PTokenOffer.findMany.mockResolvedValue([
      makeOffer({
        user: {
          id: 'trader-1',
          firstName: null,
          lastName: null,
          email: 'new@example.com',
          phoneVerifiedAt: null,
          kycStatus: 'NOT_STARTED',
          country: null,
        },
      }),
    ]);

    const result = await service.listOffers('viewer-1', {
      sortBy: 'createdAt',
      sortDir: 'desc',
      page: 1,
      pageSize: 20,
    } as any);

    expect(result.items[0]).toMatchObject({
      completedSaleCount: 0,
      user: expect.objectContaining({ phoneVerified: false, kycVerified: false, country: null }),
    });
  });

  it('sorts by price via a raw query, bypassing findMany/count', async () => {
    prisma.$queryRaw
      .mockResolvedValueOnce([{ id: 'offer-1' }])
      .mockResolvedValueOnce([{ count: 1n }]);
    prisma.p2PTokenOffer.findMany.mockResolvedValue([makeOffer()]);

    const result = await service.listOffers('viewer-1', {
      sortBy: 'price',
      sortDir: 'asc',
      page: 1,
      pageSize: 20,
    } as any);

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
    expect(prisma.p2PTokenOffer.count).not.toHaveBeenCalled();
    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(1);
  });
});

describe('P2PService.requestTradeOtp', () => {
  let prisma: any;
  let otp: any;
  let service: P2PService;

  beforeEach(() => {
    prisma = { user: { findUniqueOrThrow: jest.fn() } };
    otp = {
      issueForUser: jest.fn().mockResolvedValue({ otpRequestId: 'otp-1', expiresInSeconds: 600 }),
    };
    const platformSettings = {
      getOtpChannel: jest.fn().mockResolvedValue('sms'),
      isWhatsappOtpEnabled: jest.fn().mockResolvedValue(false),
    };
    service = new P2PService(prisma, otp, platformSettings as any, {} as any);
  });

  it('emails the OTP when the caller has no verified phone', async () => {
    prisma.user.findUniqueOrThrow.mockResolvedValue({
      email: 'a@b.com',
      phoneNumber: null,
      phoneVerifiedAt: null,
    });

    await service.requestTradeOtp('user-1', { action: 'accept-offer', offerId: 'offer-1' } as any);

    expect(otp.issueForUser).toHaveBeenCalledWith(
      'user-1',
      'P2P_TRADE',
      'a@b.com',
      expect.any(String),
      'EMAIL',
    );
  });

  it('prefers SMS to a verified phone number', async () => {
    prisma.user.findUniqueOrThrow.mockResolvedValue({
      email: 'a@b.com',
      phoneNumber: '+15551234567',
      phoneVerifiedAt: new Date(),
    });

    await service.requestTradeOtp('user-1', { action: 'accept-offer', offerId: 'offer-1' } as any);

    expect(otp.issueForUser).toHaveBeenCalledWith(
      'user-1',
      'P2P_TRADE',
      '+15551234567',
      expect.any(String),
      'SMS',
    );
  });
});

/**
 * Trades no longer die when paymentDeadlineAt elapses -- that timestamp is
 * now only the countdown both parties see. In production the old behaviour
 * was cancelling more trades than the users were: of 223 cancelled trades,
 * 160 were auto-expiries against 63 real user cancellations.
 */
describe('P2PService.expireStaleRecords trade handling', () => {
  function setup(settings: Record<string, unknown> = {}) {
    const prisma: any = {
      p2PTokenOffer: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      p2PTokenTrade: { findMany: jest.fn().mockResolvedValue([]) },
      p2PMarketSettings: {
        upsert: jest.fn().mockResolvedValue({ abandonedTradeHours: 48, ...settings }),
      },
    };
    const service = new P2PService(prisma as never, {} as never, {} as never, {} as never);
    const cancelTrade = jest
      .spyOn(service as any, 'cancelTrade')
      .mockResolvedValue(undefined);
    return { service, prisma, cancelTrade };
  }

  function tradeWhere(prisma: any) {
    return prisma.p2PTokenTrade.findMany.mock.calls[0][0].where.OR as Array<
      Record<string, unknown>
    >;
  }

  it('cancels an unpaid trade as soon as its payment deadline passes', async () => {
    const { service, prisma } = setup();

    await (service as any).expireStaleRecords();

    // 15 minutes is the whole window now -- there is no extra grace and no
    // hours-scale backstop behind it.
    const unpaid = tradeWhere(prisma).find((c) => (c as any).paymentDeadlineAt) as any;
    expect(unpaid).toBeDefined();
    expect(unpaid.status).toBe('AWAITING_PAYMENT');
    expect(unpaid.paymentDeadlineAt.lt).toBeInstanceOf(Date);
  });

  it('never sweeps a trade the buyer has marked paid', async () => {
    const { service, prisma } = setup();

    await (service as any).expireStaleRecords();

    // Once payment is claimed the clock stops mattering: only a release or
    // a dispute resolves it from there.
    expect(JSON.stringify(tradeWhere(prisma))).not.toContain('PAID_MARKED');
  });

  it('has no hours-scale backstop left', async () => {
    const { service, prisma } = setup();

    await (service as any).expireStaleRecords();

    // The 48h abandoned-trade net is gone end to end.
    expect(JSON.stringify(tradeWhere(prisma))).not.toContain('createdAt');
    expect(tradeWhere(prisma)).toHaveLength(2);
  });

  it('leaves offers alone entirely -- they do not expire', async () => {
    const { service, prisma } = setup();

    await (service as any).expireStaleRecords();

    // A post stays listed until its owner takes it down.
    expect(prisma.p2PTokenOffer.findMany).not.toHaveBeenCalled();
    expect(prisma.p2PTokenOffer.updateMany).not.toHaveBeenCalled();
  });

  it('relists only the unpaid sweep, never a user-requested cancellation', async () => {
    const { service, prisma, cancelTrade } = setup();
    prisma.p2PTokenTrade.findMany.mockResolvedValue([
      { id: 'unpaid', status: 'AWAITING_PAYMENT' },
      { id: 'user-cancelled', status: 'CANCEL_PENDING' },
    ]);

    await (service as any).expireStaleRecords();

    // A seller never asked for their listing to come down just because a
    // buyer failed to pay, so that offer goes back on the market. A
    // CANCEL_PENDING trade completing is an explicit decision to end it.
    expect(cancelTrade).toHaveBeenCalledWith('unpaid', true);
    expect(cancelTrade).toHaveBeenCalledWith('user-cancelled', false);
  });

  it('still finalizes a CANCEL_PENDING trade past its grace period', async () => {
    const { service, prisma } = setup();

    await (service as any).expireStaleRecords();

    expect(tradeWhere(prisma)).toContainEqual(
      expect.objectContaining({ status: 'CANCEL_PENDING' }),
    );
  });
});

/**
 * Offer detail + view tracking.
 *
 * The market table's Buy/Sell button was replaced by a View CTA leading
 * here, for two reasons: a mistap on a scrolling row could open a real
 * trade, and an accept straight from the row recorded nothing about
 * interest that did not convert. These tests pin the counting rules the
 * feature depends on -- deduped per viewer, never self-counted, and never
 * able to break the page it is instrumenting.
 */
describe('P2PService.getOfferDetail -- view tracking', () => {
  const OFFER_ID = 'offer-1';
  const OWNER_ID = 'trader-1';

  function makeOffer(overrides: Record<string, unknown> = {}) {
    return {
      id: OFFER_ID,
      type: 'SELL',
      userId: OWNER_ID,
      user: {
        id: OWNER_ID,
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.com',
        phoneVerifiedAt: new Date(),
        kycStatus: 'APPROVED',
        country: { code: 'NG', name: 'Nigeria' },
      },
      tokenAmount: { toString: () => '100' },
      remainingTokens: { toString: () => '100' },
      usdAmount: { toString: () => '10' },
      fiatAmount: { toString: () => '5000' },
      fiatCurrency: 'NGN',
      paymentMethod: 'BANK_TRANSFER',
      paymentMethods: [],
      status: 'ACTIVE',
      viewCount: 4,
      expiresAt: new Date(),
      completedAt: null,
      cancelledAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  let prisma: any;
  let service: P2PService;
  let tx: any;

  beforeEach(() => {
    tx = {
      p2POfferView: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'view-1' }),
        update: jest.fn().mockResolvedValue({ id: 'view-1' }),
      },
      p2PTokenOffer: { update: jest.fn().mockResolvedValue({}) },
    };
    prisma = {
      p2PTokenOffer: {
        findUnique: jest.fn().mockResolvedValue(makeOffer()),
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn(),
      },
      p2PTokenTrade: { groupBy: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn(async (fn: (t: any) => unknown) => fn(tx)),
    };
    service = new P2PService(prisma, {} as any, {} as any, {} as any);
    jest.spyOn(service as any, 'expireStaleRecords').mockResolvedValue(undefined);
  });

  it('records a view and increments the count for a first-time viewer', async () => {
    await service.getOfferDetail('viewer-1', OFFER_ID);

    expect(tx.p2POfferView.create).toHaveBeenCalledWith({
      data: { offerId: OFFER_ID, viewerId: 'viewer-1' },
    });
    expect(tx.p2PTokenOffer.update).toHaveBeenCalledWith({
      where: { id: OFFER_ID },
      data: { viewCount: { increment: 1 } },
    });
  });

  it('does not double-count a returning viewer, only bumps lastViewedAt', async () => {
    tx.p2POfferView.findUnique.mockResolvedValue({ id: 'view-1' });

    await service.getOfferDetail('viewer-1', OFFER_ID);

    expect(tx.p2POfferView.create).not.toHaveBeenCalled();
    // The count must not move -- this is the whole point of the unique row.
    expect(tx.p2PTokenOffer.update).not.toHaveBeenCalled();
    expect(tx.p2POfferView.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'view-1' } }),
    );
  });

  it('never counts the poster viewing their own offer', async () => {
    await service.getOfferDetail(OWNER_ID, OFFER_ID);

    // Otherwise every poster checking their own post would inflate the
    // demand signal the count exists to provide.
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.p2POfferView.create).not.toHaveBeenCalled();
  });

  it('still returns the offer when recording the view fails', async () => {
    prisma.$transaction.mockRejectedValue(new Error('db down'));

    const result = await service.getOfferDetail('viewer-1', OFFER_ID);

    // Analytics bookkeeping must never block someone seeing an offer they
    // are about to put money into.
    expect(result).toEqual(expect.objectContaining({ id: OFFER_ID }));
  });

  it('exposes viewCount on the serialized offer', async () => {
    const result = await service.getOfferDetail(OWNER_ID, OFFER_ID);

    expect(result).toEqual(expect.objectContaining({ viewCount: 4 }));
  });

  it('throws NotFound for an offer that does not exist', async () => {
    prisma.p2PTokenOffer.findUnique.mockResolvedValue(null);

    await expect(service.getOfferDetail('viewer-1', 'nope')).rejects.toThrow('Offer not found');
  });
});

/**
 * The phone gate on trading.
 *
 * "Can a new account with no mobile verification buy on P2P?" is a
 * launch-blocking question, and requireVerifiedForTrading was the only
 * thing answering it -- with no test pinning it. These assert the gate
 * holds on BOTH entry points, since a hole in either one is equally bad:
 * accepting an offer moves real escrow, and creating one exposes an
 * unverified account to counterparties as a tradeable listing.
 */
describe('P2PService -- phone verification gate on trading', () => {
  let prisma: any;
  let platformSettings: any;
  let service: P2PService;

  beforeEach(() => {
    prisma = {
      user: { findUniqueOrThrow: jest.fn().mockResolvedValue({ phoneVerifiedAt: null }) },
      p2PTokenOffer: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      p2PMarketSettings: { upsert: jest.fn().mockResolvedValue({}) },
    };
    platformSettings = { isPhoneVerificationRequired: jest.fn().mockResolvedValue(true) };
    service = new P2PService(prisma, {} as any, platformSettings as any, {} as any);
    jest.spyOn(service as any, 'expireStaleRecords').mockResolvedValue(undefined);
  });

  it('blocks an unverified account from accepting an offer', async () => {
    await expect(
      service.acceptOffer('new-user', 'offer-1', {} as any),
    ).rejects.toThrow('Verify your phone number before trading on the P2P market');

    // Must reject BEFORE touching the offer at all -- escrow moves in this
    // call, so the gate cannot sit after any state read/write.
    expect(prisma.p2PTokenOffer.findUnique).not.toHaveBeenCalled();
  });

  it('lets a verified account through the gate', async () => {
    prisma.user.findUniqueOrThrow.mockResolvedValue({ phoneVerifiedAt: new Date() });
    // Reaches the offer lookup instead of throwing at the gate; the call
    // then fails for an unrelated reason (no offer), which is fine here --
    // the assertion is only that the gate did not stop it.
    await expect(service.acceptOffer('ok-user', 'offer-1', {} as any)).rejects.not.toThrow(
      'Verify your phone number before trading on the P2P market',
    );
    expect(prisma.p2PTokenOffer.findUnique).toHaveBeenCalled();
  });

  it('falls back to an emailed trade OTP when phone verification is switched off', async () => {
    platformSettings.isPhoneVerificationRequired.mockResolvedValue(false);

    // With the phone requirement off there is no phone to check, so trading
    // must still not be open -- an OTP bound to the trade terms is required.
    await expect(
      service.acceptOffer('new-user', 'offer-1', {} as any),
    ).rejects.toThrow('Email OTP verification is required to trade on the P2P market');
    expect(prisma.p2PTokenOffer.findUnique).not.toHaveBeenCalled();
  });
});

/**
 * KYC on both sides, and a settled-task history on the selling side only.
 *
 * The role, not the endpoint, decides which gate applies. A member sells
 * either by creating a SELL offer OR by accepting someone else's BUY
 * offer -- gating only createOffer would leave the second route wide
 * open, which is the whole reason these tests exist.
 */
describe('P2PService -- KYC and task-history gates on trading', () => {
  const MIN_TASKS = 100;

  function setup(
    user: Record<string, unknown> = { phoneVerifiedAt: new Date(), kycStatus: 'APPROVED' },
    settledTasks = 500,
  ) {
    const prisma: any = {
      user: { findUniqueOrThrow: jest.fn().mockResolvedValue(user) },
      // Split across the three task kinds to prove they are summed, not
      // read from whichever one happens to be first.
      wordRecording: { count: jest.fn().mockResolvedValue(settledTasks) },
      domainConversationRecording: { count: jest.fn().mockResolvedValue(0) },
      wordValidation: { count: jest.fn().mockResolvedValue(0) },
      p2PTokenOffer: {
        findUnique: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
      },
      p2PMarketSettings: { upsert: jest.fn().mockResolvedValue({}) },
    };
    const platformSettings = {
      isPhoneVerificationRequired: jest.fn().mockResolvedValue(true),
      getMinCompletedTasksForWithdrawal: jest.fn().mockResolvedValue(MIN_TASKS),
    };
    const service = new P2PService(prisma, {} as any, platformSettings as any, {} as any);
    jest.spyOn(service as any, 'expireStaleRecords').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'requireMarketEnabled').mockResolvedValue({
      maxOpenOffersPerUser: 5,
      maxOpenTradesPerUser: 5,
      paymentWindowMinutes: 15,
    });
    jest.spyOn(service as any, 'validateTradeInput').mockReturnValue(undefined);
    return { service, prisma, platformSettings };
  }

  const buyDto = { type: 'BUY', tokenAmount: 10, fiatCurrency: 'NGN', paymentMethod: 'BANK_TRANSFER' };
  const sellDto = { ...buyDto, type: 'SELL', paymentMethodIds: ['acct-1'] };

  describe('KYC applies to both sides', () => {
    it('blocks an un-KYCed member from creating a BUY offer', async () => {
      const { service } = setup({ phoneVerifiedAt: new Date(), kycStatus: 'IN_REVIEW' });
      await expect(service.createOffer('u1', buyDto as any)).rejects.toThrow(
        'Complete identity verification (KYC) before trading on the P2P market',
      );
    });

    it('blocks an un-KYCed member from accepting an offer, before the offer is read', async () => {
      const { service, prisma } = setup({ phoneVerifiedAt: new Date(), kycStatus: 'NOT_STARTED' });
      prisma.p2PTokenOffer.findUnique.mockResolvedValue({
        id: 'offer-1',
        userId: 'someone-else',
        status: 'ACTIVE',
        type: 'SELL',
      });
      await expect(service.acceptOffer('u1', 'offer-1', {} as any)).rejects.toThrow(
        'Complete identity verification (KYC) before trading on the P2P market',
      );
    });
  });

  describe('task history applies to the SELLING side only', () => {
    it('blocks a short-of-tasks member from creating a SELL offer', async () => {
      const { service } = setup(undefined, 99);
      await expect(service.createOffer('u1', sellDto as any)).rejects.toThrow(
        `Complete at least ${MIN_TASKS} tasks before selling tokens on the P2P market (99/${MIN_TASKS} so far)`,
      );
    });

    it('lets a short-of-tasks member create a BUY offer -- buyers bring money in', async () => {
      const { service } = setup(undefined, 0);
      // Passes both gates and fails later on unrelated offer mechanics.
      await expect(service.createOffer('u1', buyDto as any)).rejects.not.toThrow(
        /tasks before selling/,
      );
    });

    it('blocks a short-of-tasks member from ACCEPTING a BUY offer -- the other way to sell', async () => {
      const { service, prisma } = setup(undefined, 99);
      prisma.p2PTokenOffer.findUnique.mockResolvedValue({
        id: 'offer-1',
        userId: 'someone-else',
        status: 'ACTIVE',
        // A BUY offer: its owner wants tokens, so the ACCEPTOR is selling.
        type: 'BUY',
      });
      await expect(service.acceptOffer('u1', 'offer-1', {} as any)).rejects.toThrow(
        /tasks before selling tokens/,
      );
    });

    it('lets a short-of-tasks member ACCEPT a SELL offer -- they are the buyer there', async () => {
      const { service, prisma } = setup(undefined, 0);
      prisma.p2PTokenOffer.findUnique.mockResolvedValue({
        id: 'offer-1',
        userId: 'someone-else',
        status: 'ACTIVE',
        type: 'SELL',
      });
      await expect(service.acceptOffer('u1', 'offer-1', {} as any)).rejects.not.toThrow(
        /tasks before selling/,
      );
    });

    it('sums all three task kinds rather than counting recordings alone', async () => {
      const { service, prisma } = setup(undefined, 40);
      prisma.domainConversationRecording.count.mockResolvedValue(30);
      prisma.wordValidation.count.mockResolvedValue(30);
      // 40 + 30 + 30 = exactly the minimum.
      await expect(service.createOffer('u1', sellDto as any)).rejects.not.toThrow(
        /tasks before selling/,
      );
    });

    it('counts only SETTLED work', async () => {
      const { service, prisma } = setup(undefined, 500);
      await service.createOffer('u1', sellDto as any).catch(() => undefined);
      for (const model of ['wordRecording', 'domainConversationRecording', 'wordValidation']) {
        expect(prisma[model].count).toHaveBeenCalledWith(
          expect.objectContaining({ where: expect.objectContaining({ status: 'SETTLED' }) }),
        );
      }
    });

    it('is disabled entirely when an admin sets the minimum to 0', async () => {
      const { service, platformSettings, prisma } = setup(undefined, 0);
      platformSettings.getMinCompletedTasksForWithdrawal.mockResolvedValue(0);
      await expect(service.createOffer('u1', sellDto as any)).rejects.not.toThrow(
        /tasks before selling/,
      );
      // And does not pay for three COUNTs it cannot act on.
      expect(prisma.wordRecording.count).not.toHaveBeenCalled();
    });

    it('tracks the admin setting rather than a hardcoded 100', async () => {
      const { service, platformSettings } = setup(undefined, 150);
      platformSettings.getMinCompletedTasksForWithdrawal.mockResolvedValue(200);
      await expect(service.createOffer('u1', sellDto as any)).rejects.toThrow(
        'Complete at least 200 tasks before selling tokens on the P2P market (150/200 so far)',
      );
    });
  });

  describe('getTradingEligibility -- what the UI shows up front', () => {
    it('reports a fully-qualified member as able to do both', async () => {
      const { service } = setup(undefined, 500);
      await expect(service.getTradingEligibility('u1')).resolves.toEqual({
        canBuy: true,
        canSell: true,
        phoneVerified: true,
        kycApproved: true,
        completedTasks: 500,
        minCompletedTasksForSelling: MIN_TASKS,
      });
    });

    it('reports buy-but-not-sell for a verified member short of tasks', async () => {
      const { service } = setup(undefined, 12);
      await expect(service.getTradingEligibility('u1')).resolves.toMatchObject({
        canBuy: true,
        canSell: false,
        completedTasks: 12,
      });
    });

    it('reports neither for an un-KYCed member, however many tasks they have', async () => {
      const { service } = setup({ phoneVerifiedAt: new Date(), kycStatus: 'DECLINED' }, 9999);
      await expect(service.getTradingEligibility('u1')).resolves.toMatchObject({
        canBuy: false,
        canSell: false,
        kycApproved: false,
      });
    });
  });
});

/**
 * Owner edit/delete of a post.
 *
 * The rule is "no trade already attached or executed". That is checked
 * against the trade table rather than offer.status alone, because an offer
 * whose trade later cancelled returns to ACTIVE while still having history
 * a counterparty saw and a trade row references.
 */
describe('P2PService.updateOffer / deleteOffer -- owner edits', () => {
  function setup(offer: Record<string, unknown> | null, tradeCount = 0) {
    const prisma: any = {
      p2PTokenOffer: {
        findFirst: jest.fn().mockResolvedValue(offer),
        update: jest.fn().mockResolvedValue({}),
        delete: jest.fn().mockResolvedValue({}),
      },
      p2PTokenTrade: { count: jest.fn().mockResolvedValue(tradeCount) },
      p2POfferPaymentMethod: { deleteMany: jest.fn().mockResolvedValue({}) },
      p2POfferView: { deleteMany: jest.fn().mockResolvedValue({}) },
    };
    const service = new P2PService(prisma as never, {} as never, {} as never, {} as never);
    jest.spyOn(service as any, 'expireStaleRecords').mockResolvedValue(undefined);
    return { service, prisma };
  }

  const activeOffer = {
    id: 'offer-1',
    userId: 'owner-1',
    type: 'SELL',
    status: 'ACTIVE',
    tokenAmount: { toString: () => '10' },
    fiatCurrency: 'NGN',
    paymentMethod: 'BANK_TRANSFER',
    paymentMethods: [],
  };

  it('refuses to edit a post that has any trade attached, even a cancelled one', async () => {
    const { service, prisma } = setup(activeOffer, 1);

    await expect(service.updateOffer('owner-1', 'offer-1', {} as any)).rejects.toThrow(
      /already been traded/i,
    );
    expect(prisma.p2PTokenOffer.update).not.toHaveBeenCalled();
  });

  it('refuses to delete a post that has any trade attached', async () => {
    const { service, prisma } = setup(activeOffer, 1);

    await expect(service.deleteOffer('owner-1', 'offer-1')).rejects.toThrow(
      /already been traded/i,
    );
    expect(prisma.p2PTokenOffer.delete).not.toHaveBeenCalled();
  });

  it('refuses to edit a post that is mid-trade (RESERVED)', async () => {
    const { service } = setup({ ...activeOffer, status: 'RESERVED' }, 0);

    await expect(service.updateOffer('owner-1', 'offer-1', {} as any)).rejects.toThrow(
      /active trade/i,
    );
  });

  it('never lets a non-owner edit or delete -- the lookup is scoped by userId', async () => {
    const { service, prisma } = setup(null, 0);

    await expect(service.updateOffer('someone-else', 'offer-1', {} as any)).rejects.toThrow(
      'Offer not found',
    );
    expect(prisma.p2PTokenOffer.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'offer-1', userId: 'someone-else' } }),
    );
  });

  it('deletes a clean post and clears its payment methods and view rows', async () => {
    const { service, prisma } = setup({ ...activeOffer, type: 'BUY' }, 0);

    const result = await service.deleteOffer('owner-1', 'offer-1');

    expect(result).toEqual({ id: 'offer-1', deleted: true });
    expect(prisma.p2POfferPaymentMethod.deleteMany).toHaveBeenCalledWith({
      where: { offerId: 'offer-1' },
    });
    expect(prisma.p2POfferView.deleteMany).toHaveBeenCalledWith({
      where: { offerId: 'offer-1' },
    });
    expect(prisma.p2PTokenOffer.delete).toHaveBeenCalledWith({ where: { id: 'offer-1' } });
  });
});

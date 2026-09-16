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
    otp = { issueForUser: jest.fn().mockResolvedValue({ otpRequestId: 'otp-1', expiresInSeconds: 600 }) };
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

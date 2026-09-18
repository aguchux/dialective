import { BadRequestException, NotFoundException } from '@nestjs/common';
import { P2PService } from './p2p.service';

const decimal = (value: number) => ({ toString: () => String(value), toNumber: () => value });

function makeSettings(overrides: Record<string, unknown> = {}) {
  return {
    id: 'default',
    enabled: true,
    sellOffersEnabled: true,
    buyRequestsEnabled: true,
    minTradeTokens: decimal(1),
    maxTradeTokens: decimal(1000),
    paymentWindowMinutes: 15,
    cancelGraceMinutes: 5,
    offerExpiryMinutes: 1440,
    maxOpenOffersPerUser: 5,
    maxOpenTradesPerUser: 3,
    allowedFiatCurrencies: 'NGN',
    allowedPaymentMethods: 'BANK_TRANSFER',
    disputeWindowMinutes: 1440,
    adminOtpRequiredForDisputes: true,
    ...overrides,
  };
}

function makeAccount(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    userId: 'seller-1',
    type: 'BANK',
    currency: 'NGN',
    verificationStatus: 'VERIFIED',
    ...overrides,
  };
}

function setup() {
  const prisma: any = {
    p2PMarketSettings: { upsert: jest.fn().mockResolvedValue(makeSettings()) },
    p2PTokenOffer: {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockResolvedValue({ id: 'offer-1' }),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    p2POfferPaymentMethod: {
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    p2PTokenTrade: {
      create: jest.fn().mockResolvedValue({ id: 'trade-1' }),
      count: jest.fn().mockResolvedValue(0),
      findFirst: jest.fn(),
    },
    payoutAccount: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    user: {
      // Fully eligible to trade: verified phone and approved KYC. These
      // suites are about payment accounts, not the trading gates.
      findUniqueOrThrow: jest
        .fn()
        .mockResolvedValue({ phoneVerifiedAt: new Date(), kycStatus: 'APPROVED' }),
      findUnique: jest.fn().mockResolvedValue({
        country: { currencyCode: 'NGN', usdExchangeRate: decimal(1500) },
      }),
    },
    // Settled-task counts behind the sell gate -- comfortably over any bar.
    wordRecording: { count: jest.fn().mockResolvedValue(200) },
    domainConversationRecording: { count: jest.fn().mockResolvedValue(0) },
    wordValidation: { count: jest.fn().mockResolvedValue(0) },
    country: {
      findFirst: jest
        .fn()
        .mockResolvedValue({ currencyCode: 'NGN', usdExchangeRate: decimal(1500) }),
    },
    wallet: {
      upsert: jest.fn().mockResolvedValue({ id: 'wallet-1', balance: decimal(1000) }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    ledgerEntry: { create: jest.fn() },
    $transaction: jest.fn(async (arg: unknown) => {
      if (typeof arg === 'function') return arg(prisma);
      return Promise.all(arg as Promise<unknown>[]);
    }),
  };
  const otp = { verify: jest.fn().mockResolvedValue({ id: 'otp-1' }) };
  const platformSettings = {
    isPhoneVerificationRequired: jest.fn().mockResolvedValue(true),
    getTokenUsdRate: jest.fn().mockResolvedValue(0.1),
    getMinCompletedTasksForWithdrawal: jest.fn().mockResolvedValue(100),
  };
  const service = new P2PService(prisma, otp as any, platformSettings as any, {} as any);
  jest.spyOn(service as any, 'expireStaleRecords').mockResolvedValue(undefined);
  jest.spyOn(service as any, 'getTradeForUser').mockResolvedValue({ id: 'trade-1' });
  jest.spyOn(service as any, 'getOfferForUser').mockResolvedValue({ id: 'offer-1' });
  jest.spyOn(service as any, 'notifyTradeCreated').mockResolvedValue(undefined);
  return { service, prisma, otp };
}

const baseCreateOfferDto = {
  type: 'SELL',
  tokenAmount: 100,
  fiatAmount: 5000,
  fiatCurrency: 'NGN',
  paymentMethod: 'BANK_TRANSFER',
};

describe('P2PService.createOffer -- multi-account payment methods', () => {
  it('rejects a SELL offer with no paymentMethodIds', async () => {
    const { service } = setup();

    await expect(
      service.createOffer('seller-1', { ...baseCreateOfferDto } as never),
    ).rejects.toThrow(BadRequestException);
  });

  it('accepts payment accounts regardless of verificationStatus (free-entry allowed)', async () => {
    const { service, prisma } = setup();
    prisma.payoutAccount.findMany.mockResolvedValue([
      makeAccount('acct-1', { verificationStatus: 'UNVERIFIED' }),
    ]);

    await service.createOffer('seller-1', {
      ...baseCreateOfferDto,
      paymentMethodIds: ['acct-1'],
    } as never);

    expect(prisma.p2PTokenOffer.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ paymentMethodId: 'acct-1' }) }),
    );
  });

  it('writes one P2POfferPaymentMethod row per selected account, and sets the first as primary', async () => {
    const { service, prisma } = setup();
    prisma.payoutAccount.findMany.mockResolvedValue([makeAccount('acct-1'), makeAccount('acct-2')]);

    await service.createOffer('seller-1', {
      ...baseCreateOfferDto,
      paymentMethodIds: ['acct-1', 'acct-2'],
    } as never);

    expect(prisma.p2PTokenOffer.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ paymentMethodId: 'acct-1' }) }),
    );
    const createdOfferId = prisma.p2PTokenOffer.create.mock.calls[0][0].data.id;
    expect(prisma.p2POfferPaymentMethod.createMany).toHaveBeenCalledWith({
      data: [
        { offerId: createdOfferId, payoutAccountId: 'acct-1' },
        { offerId: createdOfferId, payoutAccountId: 'acct-2' },
      ],
    });
  });

  it('rejects when a selected account is not owned by the caller', async () => {
    const { service, prisma } = setup();
    // Only one of the two requested ids resolves -- simulates the other
    // belonging to a different user (findMany's userId filter excludes it).
    prisma.payoutAccount.findMany.mockResolvedValue([makeAccount('acct-1')]);

    await expect(
      service.createOffer('seller-1', {
        ...baseCreateOfferDto,
        paymentMethodIds: ['acct-1', 'not-mine'],
      } as never),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('P2PService.acceptOffer -- buyer picks the seller account to pay into', () => {
  function makeOffer(overrides: Record<string, unknown> = {}) {
    return {
      id: 'offer-1',
      type: 'SELL',
      status: 'ACTIVE',
      userId: 'seller-1',
      tokenAmount: decimal(100),
      fiatAmount: decimal(5000),
      fiatCurrency: 'NGN',
      paymentMethod: 'BANK_TRANSFER',
      paymentMethodId: 'acct-1',
      expiresAt: new Date(Date.now() + 60_000),
      paymentMethodRef: makeAccount('acct-1'),
      paymentMethods: [
        { offerId: 'offer-1', payoutAccountId: 'acct-1' },
        { offerId: 'offer-1', payoutAccountId: 'acct-2' },
      ],
      ...overrides,
    };
  }

  it('uses the buyer-specified sellerPaymentMethodId when it is one of the offer-listed accounts', async () => {
    const { service, prisma } = setup();
    prisma.p2PTokenOffer.findUnique.mockResolvedValue(makeOffer());

    await service.acceptOffer('buyer-1', 'offer-1', { sellerPaymentMethodId: 'acct-2' } as never);

    expect(prisma.p2PTokenTrade.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ sellerPaymentMethodId: 'acct-2' }),
      }),
    );
  });

  it('rejects a sellerPaymentMethodId that is not one of the offer-listed accounts', async () => {
    const { service, prisma } = setup();
    prisma.p2PTokenOffer.findUnique.mockResolvedValue(makeOffer());

    await expect(
      service.acceptOffer('buyer-1', 'offer-1', {
        sellerPaymentMethodId: 'acct-not-listed',
      } as never),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.p2PTokenTrade.create).not.toHaveBeenCalled();
  });

  it('falls back to the offer primary paymentMethodId when the buyer specifies none (single-account offer, backward compat)', async () => {
    const { service, prisma } = setup();
    prisma.p2PTokenOffer.findUnique.mockResolvedValue(makeOffer({ paymentMethods: [] }));

    await service.acceptOffer('buyer-1', 'offer-1', {} as never);

    expect(prisma.p2PTokenTrade.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ sellerPaymentMethodId: 'acct-1' }),
      }),
    );
  });
});

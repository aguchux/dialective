import { UnprocessableEntityException } from '@nestjs/common';
import { P2PService } from './p2p.service';

const decimal = (value: number) => ({ toString: () => String(value), toNumber: () => value });

function setup(options: { currency?: string; exchangeRate?: number } = {}) {
  const currency = options.currency ?? 'NGN';
  const exchangeRate = options.exchangeRate ?? 1500;
  const settings = {
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
    allowedFiatCurrencies: 'NGN,USD,USDT,USDC',
    allowedPaymentMethods: 'BANK_TRANSFER,MOBILE_MONEY,STABLECOIN',
    disputeWindowMinutes: 1440,
    adminOtpRequiredForDisputes: true,
  };
  const account = {
    id: 'account-1',
    userId: 'user-1',
    type: currency === 'USDT' ? 'STABLECOIN_WALLET' : 'BANK',
    currency,
  };
  const prisma: any = {
    p2PMarketSettings: { upsert: jest.fn().mockResolvedValue(settings) },
    p2PTokenOffer: {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockResolvedValue({ id: 'offer-1' }),
    },
    p2POfferPaymentMethod: { createMany: jest.fn() },
    payoutAccount: { findMany: jest.fn().mockResolvedValue([account]) },
    user: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({ phoneVerifiedAt: new Date() }),
      findUnique: jest.fn().mockResolvedValue({
        country: {
          currencyCode: 'NGN',
          usdExchangeRate: decimal(1500),
          exchangeRateUpdatedAt: new Date('2026-09-16T00:00:00Z'),
        },
      }),
    },
    country: {
      findFirst: jest.fn().mockResolvedValue({
        currencyCode: 'NGN',
        usdExchangeRate: decimal(exchangeRate),
      }),
      findMany: jest.fn().mockResolvedValue([
        {
          currencyCode: 'NGN',
          usdExchangeRate: decimal(exchangeRate),
          exchangeRateUpdatedAt: new Date('2026-09-16T00:00:00Z'),
        },
      ]),
    },
    wallet: {
      upsert: jest.fn().mockResolvedValue({ id: 'wallet-1' }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    ledgerEntry: { create: jest.fn() },
    $transaction: jest.fn(async (callback: (tx: any) => unknown) => callback(prisma)),
  };
  const platformSettings = {
    isPhoneVerificationRequired: jest.fn().mockResolvedValue(true),
    getTokenUsdRate: jest.fn().mockResolvedValue(0.1),
  };
  const service = new P2PService(prisma, {} as never, platformSettings as never, {} as never);
  jest.spyOn(service as any, 'getOfferForUser').mockResolvedValue({ id: 'offer-1' });
  return { service, prisma };
}

describe('P2PService server-owned offer pricing', () => {
  it('snapshots USD and derives local currency without trusting a client fiat amount', async () => {
    const { service, prisma } = setup();

    await service.createOffer('user-1', {
      type: 'SELL',
      tokenAmount: 100,
      fiatAmount: 999999,
      fiatCurrency: 'NGN',
      paymentMethod: 'BANK_TRANSFER',
      paymentMethodIds: ['account-1'],
    } as never);

    expect(prisma.p2PTokenOffer.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ usdAmount: 10, fiatAmount: 15000, fiatCurrency: 'NGN' }),
      }),
    );
  });

  it('treats USDT as a 1:1 USD settlement currency', async () => {
    const { service, prisma } = setup({ currency: 'USDT' });

    await service.createOffer('user-1', {
      type: 'SELL',
      tokenAmount: 25,
      fiatCurrency: 'USDT',
      paymentMethod: 'STABLECOIN',
      paymentMethodIds: ['account-1'],
    } as never);

    expect(prisma.p2PTokenOffer.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ usdAmount: 2.5, fiatAmount: 2.5, fiatCurrency: 'USDT' }),
      }),
    );
  });

  it('rejects a sell offer whose payout account cannot receive the selected currency', async () => {
    const { service } = setup({ currency: 'USDT' });

    await expect(
      service.createOffer('user-1', {
        type: 'SELL',
        tokenAmount: 25,
        fiatCurrency: 'NGN',
        paymentMethod: 'BANK_TRANSFER',
        paymentMethodIds: ['account-1'],
      } as never),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('returns country currency first and includes enabled stablecoin quotes', async () => {
    const { service } = setup();

    await expect(service.getReferenceRate('user-1')).resolves.toMatchObject({
      currencyCode: 'NGN',
      tokenReferencePrice: '150',
      tokenUsdPrice: '0.1',
      availableCurrencies: [
        { currencyCode: 'NGN', tokenReferencePrice: '150' },
        { currencyCode: 'USD', tokenReferencePrice: '0.1' },
        { currencyCode: 'USDT', tokenReferencePrice: '0.1' },
        { currencyCode: 'USDC', tokenReferencePrice: '0.1' },
      ],
    });
  });
});

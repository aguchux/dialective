import { Prisma } from '@dialectiva/db';
import { P2PService } from './p2p.service';
import { p2pAdminRevokeAllContextHash } from './p2p-trade-otp-context.util';

/**
 * Clearing the market before new settings apply.
 *
 * The refusals are the feature here, same as force-resolve. This returns
 * escrow in bulk, so what has to hold is that it returns each seller's own
 * tokens and nobody else's, and that it never closes a route a buyer can
 * still use: an OPEN dispute is untouchable at any age, and a paid-marked
 * trade inside the dispute window is left alone because cancelling it would
 * take away the buyer's ability to raise one.
 */
describe('P2PService.revokeAllOffers', () => {
  // Real Decimals, not a stub: the service adds them with Prisma.Decimal,
  // which rejects a foreign object outright -- a stub made every row throw
  // and be counted as a failure.
  const decimal = (value: number) => new Prisma.Decimal(value);

  const DISPUTE_WINDOW_MINUTES = 1440;

  function build(options: {
    offers?: Record<string, unknown>[];
    staleTrades?: Record<string, unknown>[];
    settings?: Record<string, unknown>;
    offerStatusAfter?: string;
    tradeStatusAfter?: string;
  }) {
    const settings = {
      adminOtpRequiredForDisputes: true,
      disputeWindowMinutes: DISPUTE_WINDOW_MINUTES,
      ...options.settings,
    };
    const offers = options.offers ?? [];
    const staleTrades = options.staleTrades ?? [];

    const prisma = {
      p2PTokenOffer: {
        aggregate: jest.fn().mockResolvedValue({
          _count: offers.filter((o) => o.type === 'SELL').length,
          _sum: {
            tokenAmount: decimal(
              offers
                .filter((o) => o.type === 'SELL')
                .reduce(
                  (sum, o) => sum + Number((o.tokenAmount as Prisma.Decimal).toString()),
                  0,
                ),
            ),
          },
        }),
        count: jest.fn().mockResolvedValue(offers.filter((o) => o.type === 'BUY').length),
        findMany: jest.fn().mockResolvedValue(offers),
        // cancelSellOffer loads the full offer (needs user.wallet), then the
        // sweep re-reads just the status. One mock serves both.
        findUnique: jest.fn().mockImplementation((args: { where: { id: string }; include?: unknown }) => {
          // cancelSellOffer reads with `include` (it needs user.wallet); the
          // sweep re-reads the status with `select`.
          if (!args.include) {
            return Promise.resolve({ status: options.offerStatusAfter ?? 'CANCELLED' });
          }
          const offer = offers.find((o) => o.id === args.where.id);
          if (!offer) return Promise.resolve(null);
          return Promise.resolve({
            ...offer,
            status: 'ACTIVE',
            user: { wallet: { id: `wallet-${offer.userId as string}` } },
          });
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({}),
      },
      p2PTokenTrade: {
        aggregate: jest.fn().mockResolvedValue({ _count: 0, _sum: { tokenAmount: decimal(0) } }),
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue(staleTrades),
        // refundTradeToSeller loads the full trade (needs seller.wallet),
        // then the sweep re-reads just the status. One mock serves both.
        findUnique: jest.fn().mockImplementation((args: { where: { id: string }; include?: unknown }) => {
          if (!args.include) {
            return Promise.resolve({ status: options.tradeStatusAfter ?? 'CANCELLED' });
          }
          const trade = staleTrades.find((t) => t.id === args.where.id);
          if (!trade) return Promise.resolve(null);
          return Promise.resolve({
            ...trade,
            offerId: 'offer-x',
            status: 'PAID_MARKED',
            seller: { wallet: { id: 'wallet-1' } },
          });
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      // cancelSellOffer / refundTradeToSeller build their unlock + ledger
      // row through these; the $transaction mock is what actually "runs" them.
      wallet: { update: jest.fn().mockReturnValue({}) },
      ledgerEntry: { create: jest.fn().mockReturnValue({}) },
      p2PDispute: { update: jest.fn().mockReturnValue({}) },
      p2PMarketSettings: { upsert: jest.fn().mockResolvedValue(settings) },
      user: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          email: 'admin@example.com',
          phoneNumber: null,
          phoneVerifiedAt: null,
        }),
      },
      $transaction: jest.fn().mockResolvedValue([]),
    };

    const otp = {
      verify: jest.fn().mockResolvedValue({}),
      issueForUser: jest.fn().mockResolvedValue({ otpRequestId: 'otp-1' }),
    };
    const platformSettings = {
      isP2pSmsCancelledEnabled: jest.fn().mockResolvedValue(false),
      isP2pSmsTokensReleasedEnabled: jest.fn().mockResolvedValue(false),
      getOtpChannel: jest.fn().mockResolvedValue('email'),
      isWhatsappOtpEnabled: jest.fn().mockResolvedValue(false),
    };

    const service = new P2PService(
      prisma as never,
      otp as never,
      platformSettings as never,
      { send: jest.fn() } as never,
    );
    // The sweep that runs at the top of every read; irrelevant here and it
    // would otherwise need the whole expiry fixture set.
    (service as unknown as { expireStaleRecords: () => Promise<void> }).expireStaleRecords = jest
      .fn()
      .mockResolvedValue(undefined);
    return { service, prisma, otp, platformSettings };
  }

  const sellOffer = (id: string, tokens: number, userId = 'seller-1') => ({
    id,
    type: 'SELL',
    userId,
    tokenAmount: decimal(tokens),
  });
  const buyOffer = (id: string, userId = 'buyer-1') => ({
    id,
    type: 'BUY',
    userId,
    tokenAmount: decimal(0),
  });

  it('refuses without a code while admin OTP is required', async () => {
    const { service, prisma } = build({ offers: [sellOffer('offer-1', 100)] });

    await expect(service.revokeAllOffers('admin-1', {})).rejects.toThrow(
      /OTP verification is required/,
    );
    // Nothing moved.
    expect(prisma.p2PTokenOffer.findMany).not.toHaveBeenCalled();
  });

  it('binds the code to the scope the admin was shown', async () => {
    const { service, otp } = build({
      offers: [sellOffer('offer-1', 100), buyOffer('offer-2')],
    });

    await service.revokeAllOffers('admin-1', { otpRequestId: 'otp-1', code: '123456' });

    expect(otp.verify).toHaveBeenCalledWith(
      expect.objectContaining({
        contextHash: p2pAdminRevokeAllContextHash({ offerCount: 2, tokenAmount: '100' }),
      }),
    );
  });

  it('produces a different hash when the market grows', async () => {
    // The point of binding counts: a code approved against a small market
    // must not clear a larger one that appeared since.
    expect(p2pAdminRevokeAllContextHash({ offerCount: 2, tokenAmount: '100' })).not.toEqual(
      p2pAdminRevokeAllContextHash({ offerCount: 3, tokenAmount: '100' }),
    );
    expect(p2pAdminRevokeAllContextHash({ offerCount: 2, tokenAmount: '100' })).not.toEqual(
      p2pAdminRevokeAllContextHash({ offerCount: 2, tokenAmount: '250' }),
    );
  });

  it('proceeds without a code when admin OTP is switched off', async () => {
    const { service, otp } = build({
      offers: [sellOffer('offer-1', 100)],
      settings: { adminOtpRequiredForDisputes: false },
    });

    const result = await service.revokeAllOffers('admin-1', {});

    expect(otp.verify).not.toHaveBeenCalled();
    expect(result.cancelledSellOffers).toBe(1);
  });

  it('counts sell and buy offers separately and only refunds sell escrow', async () => {
    // A BUY offer holds no escrow -- the accepting seller locks the tokens
    // -- so cancelling one returns nothing.
    const { service } = build({
      offers: [sellOffer('offer-1', 100), sellOffer('offer-2', 50), buyOffer('offer-3')],
      settings: { adminOtpRequiredForDisputes: false },
    });

    const result = await service.revokeAllOffers('admin-1', {});

    expect(result.cancelledSellOffers).toBe(2);
    expect(result.cancelledBuyOffers).toBe(1);
    expect(result.tokensRefunded).toBe('150');
  });

  it('does not count an offer that was accepted mid-sweep', async () => {
    // cancelSellOffer returns early unless the offer is still ACTIVE. The
    // re-read is what catches it, so the escrow is left with its trade
    // rather than being double-counted as refunded.
    const { service } = build({
      offers: [sellOffer('offer-1', 100)],
      settings: { adminOtpRequiredForDisputes: false },
      offerStatusAfter: 'RESERVED',
    });

    const result = await service.revokeAllOffers('admin-1', {});

    expect(result.cancelledSellOffers).toBe(0);
    expect(result.tokensRefunded).toBe('0');
  });

  it('refunds abandoned paid-marked trades and counts them separately', async () => {
    const { service } = build({
      settings: { adminOtpRequiredForDisputes: false },
      staleTrades: [
        { id: 'trade-1', sellerId: 'seller-1', tokenAmount: decimal(25) },
        { id: 'trade-2', sellerId: 'seller-2', tokenAmount: decimal(45) },
      ],
    });

    const result = await service.revokeAllOffers('admin-1', {});

    expect(result.refundedTradeCount).toBe(2);
    expect(result.tokensRefunded).toBe('70');
  });

  it('selects stale trades by the dispute window, never the payment window', async () => {
    // paymentWindowMinutes governs how long a buyer has to pay; once they
    // mark paid it stops mattering. What decides whether a refund takes
    // something away is whether the buyer can still raise a dispute.
    const { service, prisma } = build({
      settings: { adminOtpRequiredForDisputes: false, paymentWindowMinutes: 15 },
      staleTrades: [],
    });

    await service.revokeAllOffers('admin-1', {});

    const where = prisma.p2PTokenTrade.findMany.mock.calls[0][0].where;
    expect(where.status).toBe('PAID_MARKED');
    const cutoff = where.paidAt.lt as Date;
    const minutesAgo = (Date.now() - cutoff.getTime()) / 60_000;
    expect(Math.round(minutesAgo)).toBe(DISPUTE_WINDOW_MINUTES);
  });

  it('never selects a trade with an open dispute', async () => {
    // The same boundary loadForceResolvableTrade draws, not overridden
    // just because this runs in bulk.
    const { service, prisma } = build({
      settings: { adminOtpRequiredForDisputes: false },
    });

    await service.revokeAllOffers('admin-1', {});

    const where = prisma.p2PTokenTrade.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual([
      { dispute: { is: null } },
      { dispute: { status: { not: 'OPEN' } } },
    ]);
  });

  it('does not count a trade that resolved mid-sweep', async () => {
    const { service } = build({
      settings: { adminOtpRequiredForDisputes: false },
      staleTrades: [{ id: 'trade-1', sellerId: 'seller-1', tokenAmount: decimal(25) }],
      tradeStatusAfter: 'RELEASED',
    });

    const result = await service.revokeAllOffers('admin-1', {});

    expect(result.refundedTradeCount).toBe(0);
    expect(result.tokensRefunded).toBe('0');
  });

  it('keeps going when one offer fails, rather than stranding the rest', async () => {
    const { service, prisma } = build({
      offers: [sellOffer('offer-1', 100), sellOffer('offer-2', 50)],
      settings: { adminOtpRequiredForDisputes: false },
    });
    // First cancellation blows up; the second must still run.
    prisma.$transaction
      .mockRejectedValueOnce(new Error('deadlock'))
      .mockResolvedValue([]);

    const result = await service.revokeAllOffers('admin-1', {});

    expect(result.failedCount).toBe(1);
    expect(result.cancelledSellOffers).toBe(1);
    expect(result.tokensRefunded).toBe('50');
  });

  it('notifies each seller once, not once per cancelled offer', async () => {
    const { service, platformSettings } = build({
      offers: [
        sellOffer('offer-1', 10, 'seller-1'),
        sellOffer('offer-2', 10, 'seller-1'),
        sellOffer('offer-3', 10, 'seller-2'),
      ],
      settings: { adminOtpRequiredForDisputes: false },
    });
    platformSettings.isP2pSmsCancelledEnabled.mockResolvedValue(true);
    const notify = jest.fn().mockResolvedValue(undefined);
    (service as unknown as { notify: unknown }).notify = notify;

    await service.revokeAllOffers('admin-1', {});
    // notifyRevokedSellers is fire-and-forget, so let the microtask queue drain.
    await new Promise((resolve) => setImmediate(resolve));

    expect(notify).toHaveBeenCalledTimes(2);
  });
});

import { P2PService } from './p2p.service';
import { p2pAdminForceResolveContextHash } from './p2p-trade-otp-context.util';

/**
 * Force-resolution of a trade nobody can move: marked paid by the buyer,
 * never released by the seller, no dispute raised. The escrow sits locked
 * indefinitely because markPaid ignores the payment deadline, the stale
 * sweep never touches PAID_MARKED, and requestCancel refuses it outright.
 *
 * The tests that matter most here are the refusals. This action moves real
 * escrow with no dispute row behind it, so the guards ARE the feature: a
 * live trade must not be reachable, an open dispute must keep its own
 * resolution path, and a code issued for one escrow figure or direction
 * must not complete a different one.
 */
describe('P2PService.forceResolveTrade', () => {
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
      sellerPaymentMethod: null,
      usdAmount: decimal(15),
      fiatAmount: decimal(244),
      fiatCurrency: 'ZAR',
      paymentMethod: 'BANK_TRANSFER',
      paymentDeadlineAt: new Date('2026-09-18T01:00:00Z'),
      cancelRequestedByUserId: null,
      cancelAvailableAt: null,
      releasedAt: null,
      cancelledAt: null,
      disputedAt: null,
      updatedAt: new Date('2026-09-18T00:00:00Z'),
      tokenAmount: decimal(150),
      status: 'PAID_MARKED',
      dispute: null,
      paidAt: new Date('2026-09-18T00:00:00Z'),
      createdAt: new Date('2026-09-17T00:00:00Z'),
      ...overrides,
    };
  }

  function build(trade: Record<string, unknown> | null, settings = { adminOtpRequiredForDisputes: true }) {
    const prisma = {
      p2PTokenTrade: {
        findUnique: jest.fn().mockResolvedValue(trade),
        findUniqueOrThrow: jest.fn().mockResolvedValue(trade),
        findMany: jest.fn().mockResolvedValue([]),
      },
      p2PMarketSettings: { upsert: jest.fn().mockResolvedValue(settings) },
      user: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          email: 'admin@example.com',
          phoneNumber: null,
          phoneVerifiedAt: null,
        }),
      },
    };
    const otp = {
      verify: jest.fn().mockResolvedValue({}),
      issueForUser: jest.fn().mockResolvedValue({ otpRequestId: 'otp-1' }),
    };
    const platformSettings = {
      isP2pSmsTokensReleasedEnabled: jest.fn().mockResolvedValue(false),
      isP2pSmsCancelledEnabled: jest.fn().mockResolvedValue(false),
      getOtpChannel: jest.fn().mockResolvedValue('email'),
      isWhatsappOtpEnabled: jest.fn().mockResolvedValue(false),
    };
    const service = new P2PService(
      prisma as never,
      otp as never,
      platformSettings as never,
      { send: jest.fn() } as never,
    );
    return { service, prisma, otp };
  }

  it('refuses a trade that is still live between its two parties', async () => {
    const { service } = build(makeTrade({ status: 'AWAITING_PAYMENT' }));
    await expect(
      service.forceResolveTrade('admin-1', 'trade-1', {
        outcome: 'refund-seller',
        reason: 'both parties unreachable',
      }),
    ).rejects.toThrow(/Only trades marked paid but never released/);
  });

  it('refuses an already-released trade rather than paying the escrow out twice', async () => {
    const { service } = build(makeTrade({ status: 'RELEASED' }));
    await expect(
      service.forceResolveTrade('admin-1', 'trade-1', {
        outcome: 'refund-seller',
        reason: 'both parties unreachable',
      }),
    ).rejects.toThrow(/Only trades marked paid but never released/);
  });

  /**
   * A disputed trade already has a reported reason and a resolution path
   * that closes the dispute row. Force-resolving around it would move the
   * escrow and leave the dispute open forever, pointing at nothing.
   */
  it('refuses a trade with an open dispute and points at the disputes table', async () => {
    const { service } = build(makeTrade({ dispute: { id: 'd-1', status: 'OPEN' } }));
    await expect(
      service.forceResolveTrade('admin-1', 'trade-1', {
        outcome: 'refund-seller',
        reason: 'both parties unreachable',
      }),
    ).rejects.toThrow(/open dispute/);
  });

  it('refuses without a code while the admin step-up is enabled', async () => {
    const { service } = build(makeTrade());
    await expect(
      service.forceResolveTrade('admin-1', 'trade-1', {
        outcome: 'refund-seller',
        reason: 'both parties unreachable',
      }),
    ).rejects.toThrow(/OTP verification is required/);
  });

  /**
   * The escrow figure is re-read from the row, never taken from the
   * request, so a code issued after reading one trade cannot complete a
   * resolution over a different amount.
   */
  it('binds the code to the trade, the direction and the escrow amount', async () => {
    const { service, otp } = build(makeTrade());
    const refund = jest
      .spyOn(service as never, 'refundTradeToSeller')
      .mockResolvedValue(undefined as never);

    await service.forceResolveTrade('admin-1', 'trade-1', {
      outcome: 'refund-seller',
      reason: 'both parties unreachable for five days',
      otpRequestId: 'otp-1',
      code: '123456',
    });

    expect(otp.verify).toHaveBeenCalledWith(
      expect.objectContaining({
        contextHash: p2pAdminForceResolveContextHash({
          tradeId: 'trade-1',
          outcome: 'refund-seller',
          tokenAmount: '150',
        }),
      }),
    );
    expect(refund).toHaveBeenCalledWith('trade-1');
  });

  it('a code issued for a refund does not hash-match a release', () => {
    expect(
      p2pAdminForceResolveContextHash({
        tradeId: 'trade-1',
        outcome: 'refund-seller',
        tokenAmount: '150',
      }),
    ).not.toEqual(
      p2pAdminForceResolveContextHash({
        tradeId: 'trade-1',
        outcome: 'release-buyer',
        tokenAmount: '150',
      }),
    );
  });

  /**
   * Refund goes through refundTradeToSeller with relistOffer left false --
   * the seller never asked to be put back on the market, unlike the
   * automatic non-payment sweep where nobody had claimed anything yet.
   */
  it('refunds through the shared escrow path without relisting the offer', async () => {
    const { service } = build(makeTrade(), { adminOtpRequiredForDisputes: false });
    const refund = jest
      .spyOn(service as never, 'refundTradeToSeller')
      .mockResolvedValue(undefined as never);

    await service.forceResolveTrade('admin-1', 'trade-1', {
      outcome: 'refund-seller',
      reason: 'both parties unreachable for five days',
    });

    expect(refund).toHaveBeenCalledWith('trade-1');
  });

  it('releases through the shared escrow path when the admin has proof of payment', async () => {
    const { service } = build(makeTrade(), { adminOtpRequiredForDisputes: false });
    const release = jest
      .spyOn(service as never, 'releaseTradeToBuyer')
      .mockResolvedValue(undefined as never);

    await service.forceResolveTrade('admin-1', 'trade-1', {
      outcome: 'release-buyer',
      reason: 'buyer supplied a bank receipt the seller confirmed by email',
    });

    expect(release).toHaveBeenCalledWith('trade-1');
  });

  it('will not issue a code for a trade it would then refuse to resolve', async () => {
    const { service, otp } = build(makeTrade({ status: 'CANCELLED' }));
    await expect(
      service.requestForceResolveOtp('admin-1', 'trade-1', { outcome: 'refund-seller' }),
    ).rejects.toThrow(/Only trades marked paid but never released/);
    expect(otp.issueForUser).not.toHaveBeenCalled();
  });

  it('reports a missing trade as not found', async () => {
    const { service } = build(null);
    await expect(
      service.forceResolveTrade('admin-1', 'nope', {
        outcome: 'refund-seller',
        reason: 'both parties unreachable',
      }),
    ).rejects.toThrow(/Trade not found/);
  });
});

import { P2PService } from './p2p.service';

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
  let flutterwave: any;
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
    flutterwave = { listBanks: jest.fn(), resolveAccount: jest.fn() };
    service = new P2PService(prisma, otp, platformSettings, sms, flutterwave);
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

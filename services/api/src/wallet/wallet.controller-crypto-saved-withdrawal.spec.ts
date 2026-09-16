import { Prisma } from '@dialectiva/db';
import { WalletController } from './wallet.controller';

jest.mock('@dialectiva/db', () => ({
  ...jest.requireActual('@dialectiva/db'),
  creditTrainingPayout: jest.fn(),
  creditAdminFunding: jest.fn(),
  adjustAdminWallet: jest.fn(),
}));

const OWNER_ID = 'trainer-1';
const ACCOUNT_ID = 'wallet-account-1';
const WALLET_ADDRESS = 'TXYZabc123456789XYZabc123456789XYZ';

/**
 * Exercises createWithdrawal's CRYPTO_SAVED path -- a withdrawal to a saved
 * STABLECOIN_WALLET PayoutAccount (see PayoutAccountsController.create),
 * which resolves body.payoutAccountId to a wallet address rather than taking
 * a freshly-typed destinationAddress the way plain CRYPTO withdrawals do.
 * The resulting WithdrawalRequest row must still carry a real
 * destinationAddress/Currency/Network and payoutMethod: 'CRYPTO' so it flows
 * through the existing NOWPayments submission pipeline
 * (submitWithdrawalToNowPayments) completely unchanged.
 */
function setup(overrides?: { payoutAccount?: Record<string, unknown> | null }) {
  const payoutAccount =
    'payoutAccount' in (overrides ?? {})
      ? overrides!.payoutAccount
      : {
          id: ACCOUNT_ID,
          userId: OWNER_ID,
          type: 'STABLECOIN_WALLET',
          verificationStatus: 'VERIFIED',
          stablecoinAsset: 'USDT',
          stablecoinNetwork: 'TRC20',
          walletAddress: WALLET_ADDRESS,
        };

  const prisma = {
    payoutAccount: { findUnique: jest.fn().mockResolvedValue(payoutAccount) },
    user: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        email: 'trainer@example.com',
        emailVerified: true,
        phoneVerifiedAt: new Date(),
        kycStatus: 'APPROVED',
      }),
    },
    wordRecording: { count: jest.fn().mockResolvedValue(100) },
    wallet: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'wallet-1',
        userId: OWNER_ID,
        balance: { toNumber: () => 1000 },
      }),
      create: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    withdrawalRequest: {
      create: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 'withdrawal-1', ...data }),
      ),
    },
    ledgerEntry: { create: jest.fn().mockResolvedValue({}) },
    otpCode: { update: jest.fn().mockResolvedValue({}) },
    $transaction: undefined as unknown as (input: unknown) => Promise<unknown>,
  };
  prisma.$transaction = jest.fn(async (input: unknown) => {
    if (typeof input === 'function') return (input as (tx: unknown) => unknown)(prisma);
    return Promise.all(input as Promise<unknown>[]);
  });

  const platformSettings = {
    getWithdrawalsEnabledStatus: jest.fn().mockResolvedValue({ enabled: true, message: null }),
    isCryptoWithdrawalsEnabled: jest.fn().mockResolvedValue(true),
    getMinWithdrawalTokens: jest.fn().mockResolvedValue(1),
    getMinWalletBalanceTokens: jest.fn().mockResolvedValue(0),
    getMinCompletedTasksForWithdrawal: jest.fn().mockResolvedValue(0),
    isPhoneVerificationRequired: jest.fn().mockResolvedValue(false),
    isKycRequiredForWithdrawals: jest.fn().mockResolvedValue(false),
    getKycMinWithdrawalTokens: jest.fn().mockResolvedValue(0),
    getAllowedWithdrawalCurrencies: jest.fn().mockResolvedValue(['USDT', 'USDC']),
    getAllowedWithdrawalNetworks: jest.fn().mockResolvedValue(['TRC20']),
    getTokenUsdRate: jest.fn().mockResolvedValue(new Prisma.Decimal(1)),
  };
  const otp = {
    verifyWithoutConsuming: jest.fn().mockResolvedValue({ id: 'otp-1' }),
  };
  const controller = new WalletController(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    platformSettings as never,
    otp as never,
    {} as never,
    {} as never,
  );
  return { controller, prisma, otp, platformSettings };
}

const req = { user: { sub: OWNER_ID } } as never;
const body = {
  tokenAmount: 50,
  payoutMethod: 'CRYPTO_SAVED' as const,
  payoutAccountId: ACCOUNT_ID,
  otpRequestId: 'otp-1',
  code: '123456',
};

describe('WalletController.createWithdrawal CRYPTO_SAVED', () => {
  it('resolves the address/currency/network from the saved wallet and produces a CRYPTO-method row', async () => {
    const { controller, prisma } = setup();

    const result = await controller.createWithdrawal(req, body as never);

    expect(result).toMatchObject({ withdrawalId: expect.any(String) });
    expect(prisma.withdrawalRequest.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        payoutMethod: 'CRYPTO',
        payoutAccountId: ACCOUNT_ID,
        destinationAddress: WALLET_ADDRESS,
        destinationCurrency: 'USDT',
        destinationNetwork: 'TRC20',
      }),
    });
  });

  it('rejects when the referenced account is not a STABLECOIN_WALLET', async () => {
    const { controller, prisma } = setup({
      payoutAccount: { id: ACCOUNT_ID, userId: OWNER_ID, type: 'BANK', currency: 'NGN', country: 'NG' },
    });

    await expect(controller.createWithdrawal(req, body as never)).rejects.toThrow();
    expect(prisma.withdrawalRequest.create).not.toHaveBeenCalled();
  });

  it('rejects when crypto withdrawals are disabled platform-wide', async () => {
    const { controller, prisma, platformSettings } = setup();
    platformSettings.isCryptoWithdrawalsEnabled.mockResolvedValue(false);

    await expect(controller.createWithdrawal(req, body as never)).rejects.toThrow(
      'Crypto withdrawals are currently disabled',
    );
    expect(prisma.withdrawalRequest.create).not.toHaveBeenCalled();
  });

  it('rejects a wallet whose asset is not on the admin allowlist', async () => {
    const { controller, prisma, platformSettings } = setup();
    platformSettings.getAllowedWithdrawalCurrencies.mockResolvedValue(['USDC']);

    await expect(controller.createWithdrawal(req, body as never)).rejects.toThrow(
      'USDT is not an allowed withdrawal currency',
    );
    expect(prisma.withdrawalRequest.create).not.toHaveBeenCalled();
  });

  it('rejects a withdrawal referencing another trainer\'s wallet', async () => {
    const { controller, prisma } = setup({
      payoutAccount: {
        id: ACCOUNT_ID,
        userId: 'someone-else',
        type: 'STABLECOIN_WALLET',
        verificationStatus: 'VERIFIED',
        stablecoinAsset: 'USDT',
        stablecoinNetwork: 'TRC20',
        walletAddress: WALLET_ADDRESS,
      },
    });

    await expect(controller.createWithdrawal(req, body as never)).rejects.toThrow(
      'Payout account not found',
    );
    expect(prisma.withdrawalRequest.create).not.toHaveBeenCalled();
  });
});

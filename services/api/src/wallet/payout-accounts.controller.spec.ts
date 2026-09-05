import { ForbiddenException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { OtpPurpose } from '@dialectiva/db';
import { PayoutAccountsController } from './payout-accounts.controller';
import {
  payoutAccountDeleteContextHash,
  stablecoinWalletSetupContextHash,
} from './otp-context.util';

const OWNER_ID = 'trainer-1';
const ACCOUNT_ID = 'account-1';
const WALLET_ADDRESS = 'TXYZabc123456789XYZabc123456789XYZ';

function setup(
  overrides: {
    account?: Record<string, unknown> | null;
    cryptoWithdrawalsEnabled?: boolean;
    allowedCurrencies?: string[];
    allowedNetworks?: string[];
  } = {},
) {
  const account =
    'account' in overrides ? overrides.account : { id: ACCOUNT_ID, userId: OWNER_ID, type: 'BANK' };
  const prisma = {
    payoutAccount: {
      findUnique: jest.fn().mockResolvedValue(account),
      create: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: ACCOUNT_ID, ...data }),
      ),
      delete: jest.fn().mockResolvedValue({ id: ACCOUNT_ID }),
    },
    withdrawalRequest: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    p2PTokenOffer: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    user: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({ id: OWNER_ID, email: 'trainer@example.com' }),
    },
  };
  const otp = {
    issueForUser: jest.fn().mockResolvedValue({ otpRequestId: 'otp-1', expiresInSeconds: 600 }),
    verify: jest.fn().mockResolvedValue({ id: 'otp-1' }),
  };
  const platformSettings = {
    isCryptoWithdrawalsEnabled: jest
      .fn()
      .mockResolvedValue(overrides.cryptoWithdrawalsEnabled ?? true),
    getAllowedWithdrawalCurrencies: jest
      .fn()
      .mockResolvedValue(overrides.allowedCurrencies ?? ['USDT', 'USDC']),
    getAllowedWithdrawalNetworks: jest
      .fn()
      .mockResolvedValue(overrides.allowedNetworks ?? ['TRC20']),
  };
  const controller = new PayoutAccountsController(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    platformSettings as never,
    otp as never,
  );
  return { controller, prisma, otp, platformSettings };
}

const req = { user: { sub: OWNER_ID } } as never;

describe('PayoutAccountsController.requestDeleteOtp', () => {
  it('issues an OTP bound to this specific account for the owning trainer', async () => {
    const { controller, otp } = setup();

    const result = await controller.requestDeleteOtp(req, ACCOUNT_ID);

    expect(result).toEqual({ otpRequestId: 'otp-1', expiresInSeconds: 600 });
    expect(otp.issueForUser).toHaveBeenCalledWith(
      OWNER_ID,
      OtpPurpose.PAYOUT_ACCOUNT_DELETE,
      'trainer@example.com',
      payoutAccountDeleteContextHash({ payoutAccountId: ACCOUNT_ID }),
    );
  });

  it('rejects issuing an OTP for an account the caller does not own', async () => {
    const { controller } = setup({ account: { id: ACCOUNT_ID, userId: 'someone-else' } });

    await expect(controller.requestDeleteOtp(req, ACCOUNT_ID)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('404s issuing an OTP for a nonexistent account', async () => {
    const { controller } = setup({ account: null });

    await expect(controller.requestDeleteOtp(req, ACCOUNT_ID)).rejects.toThrow(NotFoundException);
  });
});

describe('PayoutAccountsController.remove', () => {
  it('deletes only after verifying the OTP against the same account-bound context hash', async () => {
    const { controller, prisma, otp } = setup();

    const result = await controller.remove(req, ACCOUNT_ID, {
      otpRequestId: 'otp-1',
      code: '123456',
    });

    expect(otp.verify).toHaveBeenCalledWith({
      otpRequestId: 'otp-1',
      userId: OWNER_ID,
      purpose: OtpPurpose.PAYOUT_ACCOUNT_DELETE,
      code: '123456',
      contextHash: payoutAccountDeleteContextHash({ payoutAccountId: ACCOUNT_ID }),
    });
    expect(prisma.payoutAccount.delete).toHaveBeenCalledWith({ where: { id: ACCOUNT_ID } });
    expect(result).toEqual({ deleted: true });
  });

  it('never deletes when OTP verification throws', async () => {
    const { controller, prisma, otp } = setup();
    otp.verify.mockRejectedValue(new Error('Invalid or expired code'));

    await expect(
      controller.remove(req, ACCOUNT_ID, { otpRequestId: 'otp-1', code: '000000' }),
    ).rejects.toThrow('Invalid or expired code');
    expect(prisma.payoutAccount.delete).not.toHaveBeenCalled();
  });

  it('rejects deleting an account the caller does not own, without ever consulting OTP', async () => {
    const { controller, otp } = setup({ account: { id: ACCOUNT_ID, userId: 'someone-else' } });

    await expect(
      controller.remove(req, ACCOUNT_ID, { otpRequestId: 'otp-1', code: '123456' }),
    ).rejects.toThrow(ForbiddenException);
    expect(otp.verify).not.toHaveBeenCalled();
  });
});

describe('PayoutAccountsController.requestStablecoinWalletSetupOtp', () => {
  it('issues an OTP bound to the exact address/asset/network being saved', async () => {
    const { controller, otp } = setup();

    const result = await controller.requestStablecoinWalletSetupOtp(req, {
      stablecoinAsset: 'USDT',
      stablecoinNetwork: 'TRC20',
      walletAddress: WALLET_ADDRESS,
    });

    expect(result).toEqual({ otpRequestId: 'otp-1', expiresInSeconds: 600 });
    expect(otp.issueForUser).toHaveBeenCalledWith(
      OWNER_ID,
      OtpPurpose.PAYOUT_ACCOUNT_SETUP,
      'trainer@example.com',
      stablecoinWalletSetupContextHash({
        walletAddress: WALLET_ADDRESS,
        stablecoinAsset: 'USDT',
        stablecoinNetwork: 'TRC20',
      }),
    );
  });

  it('rejects when crypto withdrawals are disabled platform-wide', async () => {
    const { controller, otp } = setup({ cryptoWithdrawalsEnabled: false });

    await expect(
      controller.requestStablecoinWalletSetupOtp(req, {
        stablecoinAsset: 'USDT',
        stablecoinNetwork: 'TRC20',
        walletAddress: WALLET_ADDRESS,
      }),
    ).rejects.toThrow(UnprocessableEntityException);
    expect(otp.issueForUser).not.toHaveBeenCalled();
  });
});

describe('PayoutAccountsController.create (STABLECOIN_WALLET)', () => {
  it('saves and locks the wallet only after the setup OTP verifies against the exact address', async () => {
    const { controller, prisma, otp } = setup();

    const result = await controller.create(req, {
      type: 'STABLECOIN_WALLET',
      stablecoinAsset: 'USDT',
      stablecoinNetwork: 'TRC20',
      walletAddress: WALLET_ADDRESS,
      otpRequestId: 'otp-1',
      code: '123456',
    } as never);

    expect(otp.verify).toHaveBeenCalledWith({
      otpRequestId: 'otp-1',
      userId: OWNER_ID,
      purpose: OtpPurpose.PAYOUT_ACCOUNT_SETUP,
      code: '123456',
      contextHash: stablecoinWalletSetupContextHash({
        walletAddress: WALLET_ADDRESS,
        stablecoinAsset: 'USDT',
        stablecoinNetwork: 'TRC20',
      }),
    });
    expect(prisma.payoutAccount.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: OWNER_ID,
        type: 'STABLECOIN_WALLET',
        stablecoinAsset: 'USDT',
        stablecoinNetwork: 'TRC20',
        walletAddress: WALLET_ADDRESS,
        verificationStatus: 'VERIFIED',
      }),
    });
    expect(result).toMatchObject({ type: 'STABLECOIN_WALLET', verificationStatus: 'VERIFIED' });
    // The raw address is never echoed back -- only the masked form.
    expect(result).not.toHaveProperty('walletAddress');
  });

  it('never saves the wallet when the OTP fails to verify', async () => {
    const { controller, prisma, otp } = setup();
    otp.verify.mockRejectedValue(new Error('Invalid or expired code'));

    await expect(
      controller.create(req, {
        type: 'STABLECOIN_WALLET',
        stablecoinAsset: 'USDT',
        stablecoinNetwork: 'TRC20',
        walletAddress: WALLET_ADDRESS,
        otpRequestId: 'otp-1',
        code: '000000',
      } as never),
    ).rejects.toThrow('Invalid or expired code');
    expect(prisma.payoutAccount.create).not.toHaveBeenCalled();
  });

  it('rejects a currency not on the admin allowlist', async () => {
    const { controller, prisma } = setup({ allowedCurrencies: ['USDT'] });

    await expect(
      controller.create(req, {
        type: 'STABLECOIN_WALLET',
        stablecoinAsset: 'USDC',
        stablecoinNetwork: 'TRC20',
        walletAddress: WALLET_ADDRESS,
        otpRequestId: 'otp-1',
        code: '123456',
      } as never),
    ).rejects.toThrow(UnprocessableEntityException);
    expect(prisma.payoutAccount.create).not.toHaveBeenCalled();
  });

  it('rejects when crypto withdrawals are disabled platform-wide', async () => {
    const { controller, prisma } = setup({ cryptoWithdrawalsEnabled: false });

    await expect(
      controller.create(req, {
        type: 'STABLECOIN_WALLET',
        stablecoinAsset: 'USDT',
        stablecoinNetwork: 'TRC20',
        walletAddress: WALLET_ADDRESS,
        otpRequestId: 'otp-1',
        code: '123456',
      } as never),
    ).rejects.toThrow(UnprocessableEntityException);
    expect(prisma.payoutAccount.create).not.toHaveBeenCalled();
  });
});

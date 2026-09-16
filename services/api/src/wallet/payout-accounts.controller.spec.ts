import { ForbiddenException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { OtpPurpose } from '@dialectiva/db';
import { PayoutAccountsController } from './payout-accounts.controller';
import { payoutAccountDeleteContextHash, payoutAccountSetupContextHash } from './otp-context.util';

const OWNER_ID = 'trainer-1';
const ACCOUNT_ID = 'account-1';
const WALLET_ADDRESS = 'TXYZabc123456789XYZabc123456789XYZ';

function setup(
  overrides: {
    account?: Record<string, unknown> | null;
    cryptoWithdrawalsEnabled?: boolean;
    allowedCurrencies?: string[];
    allowedNetworks?: string[];
    phoneNumber?: string | null;
    phoneVerifiedAt?: Date | null;
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
    paymentMethodCatalog: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    user: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        id: OWNER_ID,
        email: 'trainer@example.com',
        phoneNumber: overrides.phoneNumber ?? null,
        phoneVerifiedAt: overrides.phoneVerifiedAt ?? null,
      }),
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
    getOtpChannel: jest.fn().mockResolvedValue('sms'),
    isWhatsappOtpEnabled: jest.fn().mockResolvedValue(false),
    isFlutterwaveV4Enabled: jest.fn().mockResolvedValue(false),
  };
  const flutterwave = {
    resolveAccount: jest.fn().mockResolvedValue({ accountName: 'Ada Lovelace' }),
    listBanks: jest
      .fn()
      .mockResolvedValue([{ code: '044', name: 'Access Bank' }, { code: '057', name: 'Zenith Bank' }]),
  };
  const flutterwaveV4 = { createRecipient: jest.fn() };
  const controller = new PayoutAccountsController(
    prisma as never,
    flutterwave as never,
    flutterwaveV4 as never,
    {} as never,
    platformSettings as never,
    otp as never,
  );
  return { controller, prisma, otp, platformSettings, flutterwave };
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
      'EMAIL',
    );
  });

  it('prefers SMS to the verified phone number over email', async () => {
    const { controller, otp } = setup({
      phoneNumber: '+15551234567',
      phoneVerifiedAt: new Date(),
    });

    await controller.requestDeleteOtp(req, ACCOUNT_ID);

    expect(otp.issueForUser).toHaveBeenCalledWith(
      OWNER_ID,
      OtpPurpose.PAYOUT_ACCOUNT_DELETE,
      '+15551234567',
      payoutAccountDeleteContextHash({ payoutAccountId: ACCOUNT_ID }),
      'SMS',
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

describe('PayoutAccountsController.requestSetupOtp', () => {
  it('issues an OTP bound to the exact address/asset/network being saved (STABLECOIN_WALLET)', async () => {
    const { controller, otp } = setup();

    const result = await controller.requestSetupOtp(req, {
      type: 'STABLECOIN_WALLET',
      stablecoinAsset: 'USDT',
      stablecoinNetwork: 'TRC20',
      walletAddress: WALLET_ADDRESS,
    });

    expect(result).toEqual({ otpRequestId: 'otp-1', expiresInSeconds: 600 });
    expect(otp.issueForUser).toHaveBeenCalledWith(
      OWNER_ID,
      OtpPurpose.PAYOUT_ACCOUNT_SETUP,
      'trainer@example.com',
      payoutAccountSetupContextHash({
        type: 'STABLECOIN_WALLET',
        walletAddress: WALLET_ADDRESS,
        stablecoinAsset: 'USDT',
        stablecoinNetwork: 'TRC20',
      }),
      'EMAIL',
    );
  });

  it('rejects a STABLECOIN_WALLET OTP request when crypto withdrawals are disabled platform-wide', async () => {
    const { controller, otp } = setup({ cryptoWithdrawalsEnabled: false });

    await expect(
      controller.requestSetupOtp(req, {
        type: 'STABLECOIN_WALLET',
        stablecoinAsset: 'USDT',
        stablecoinNetwork: 'TRC20',
        walletAddress: WALLET_ADDRESS,
      }),
    ).rejects.toThrow(UnprocessableEntityException);
    expect(otp.issueForUser).not.toHaveBeenCalled();
  });

  it('issues an OTP bound to the exact bankCode/accountNumber/freeEntry being saved (BANK)', async () => {
    const { controller, otp } = setup();

    await controller.requestSetupOtp(req, {
      type: 'BANK',
      bankCode: '044',
      accountNumber: '0691234567',
      freeEntry: false,
    });

    expect(otp.issueForUser).toHaveBeenCalledWith(
      OWNER_ID,
      OtpPurpose.PAYOUT_ACCOUNT_SETUP,
      'trainer@example.com',
      payoutAccountSetupContextHash({
        type: 'BANK',
        bankCode: '044',
        accountNumber: '0691234567',
        freeEntry: false,
      }),
      'EMAIL',
    );
  });

  it('issues a different hash for a free-entry BANK request than a provider-verified one with the same details', async () => {
    const { controller, otp } = setup();

    await controller.requestSetupOtp(req, {
      type: 'BANK',
      bankCode: '044',
      accountNumber: '0691234567',
      freeEntry: true,
    });

    const [, , , freeEntryHash] = otp.issueForUser.mock.calls[0];
    expect(freeEntryHash).not.toBe(
      payoutAccountSetupContextHash({
        type: 'BANK',
        bankCode: '044',
        accountNumber: '0691234567',
        freeEntry: false,
      }),
    );
  });
});

describe('PayoutAccountsController.create (BANK)', () => {
  beforeEach(() => {
    process.env.PAYOUT_ACCOUNT_ENCRYPTION_KEY = 'test-payout-encryption-key';
  });
  afterEach(() => {
    delete process.env.PAYOUT_ACCOUNT_ENCRYPTION_KEY;
  });

  const bankPayload = {
    type: 'BANK' as const,
    country: 'NG',
    currency: 'NGN',
    bankCode: '044',
    accountNumber: '0691234567',
    otpRequestId: 'otp-1',
    code: '123456',
  };

  it('looks up and stores the bank display name, not just the raw bank code', async () => {
    const { controller, prisma, flutterwave } = setup();

    const result = await controller.create(req, bankPayload);

    expect(flutterwave.listBanks).toHaveBeenCalledWith('NG');
    expect(prisma.payoutAccount.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ bankCode: '044', bankName: 'Access Bank' }),
      }),
    );
    expect((result as { bankName: string | null }).bankName).toBe('Access Bank');
  });

  it('falls back to a null bankName (never throws) when the bank code has no match in listBanks', async () => {
    const { controller, prisma } = setup();

    await controller.create(req, { ...bankPayload, bankCode: '999' });

    expect(prisma.payoutAccount.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ bankName: null }) }),
    );
  });

  it('still creates the account (bankName null) when the bank-list lookup itself fails', async () => {
    const { controller, prisma, flutterwave } = setup();
    flutterwave.listBanks.mockRejectedValue(new Error('provider unavailable'));

    await expect(controller.create(req, bankPayload)).resolves.toBeDefined();
    expect(prisma.payoutAccount.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ bankName: null }) }),
    );
  });

  it('verifies the setup OTP bound to the exact bankCode/accountNumber before creating', async () => {
    const { controller, otp } = setup();

    await controller.create(req, bankPayload);

    expect(otp.verify).toHaveBeenCalledWith({
      otpRequestId: 'otp-1',
      userId: OWNER_ID,
      purpose: OtpPurpose.PAYOUT_ACCOUNT_SETUP,
      code: '123456',
      contextHash: payoutAccountSetupContextHash({
        type: 'BANK',
        bankCode: '044',
        accountNumber: '0691234567',
        freeEntry: false,
      }),
    });
  });

  it('never creates the account when OTP verification fails', async () => {
    const { controller, prisma, otp } = setup();
    otp.verify.mockRejectedValue(new Error('Invalid or expired code'));

    await expect(controller.create(req, bankPayload)).rejects.toThrow('Invalid or expired code');
    expect(prisma.payoutAccount.create).not.toHaveBeenCalled();
  });

  it('skips Flutterwave resolveAccount/listBanks entirely for a free-entry account, saving it UNVERIFIED with provider=manual', async () => {
    const { controller, prisma, flutterwave } = setup();

    const result = await controller.create(req, { ...bankPayload, freeEntry: true });

    expect(flutterwave.resolveAccount).not.toHaveBeenCalled();
    expect(flutterwave.listBanks).not.toHaveBeenCalled();
    expect(prisma.payoutAccount.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          provider: 'manual',
          verificationStatus: 'UNVERIFIED',
        }),
      }),
    );
    expect((result as { verificationStatus: string }).verificationStatus).toBe('UNVERIFIED');
  });

  it('resolves bankName for a free-entry account from the payment method catalog, not from a provider call', async () => {
    const { controller, prisma } = setup();
    prisma.paymentMethodCatalog.findFirst.mockResolvedValue({ name: 'GTBank' });

    await controller.create(req, { ...bankPayload, freeEntry: true });

    expect(prisma.paymentMethodCatalog.findFirst).toHaveBeenCalledWith({
      where: { countryCode: 'NG', type: 'BANK', bankCode: '044' },
    });
    expect(prisma.payoutAccount.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ bankName: 'GTBank' }) }),
    );
  });
});

describe('PayoutAccountsController.create (MOBILE_MONEY)', () => {
  beforeEach(() => {
    process.env.PAYOUT_ACCOUNT_ENCRYPTION_KEY = 'test-payout-encryption-key';
  });
  afterEach(() => {
    delete process.env.PAYOUT_ACCOUNT_ENCRYPTION_KEY;
  });

  const mobileMoneyPayload = {
    type: 'MOBILE_MONEY' as const,
    country: 'GH',
    currency: 'GHS',
    mobileMoneyNetwork: 'MTN',
    mobileMoneyNumber: '0551234567',
    otpRequestId: 'otp-1',
    code: '123456',
  };

  it('verifies the setup OTP before creating, saved UNVERIFIED with provider=flutterwave by default', async () => {
    const { controller, prisma, otp } = setup();

    const result = await controller.create(req, mobileMoneyPayload);

    expect(otp.verify).toHaveBeenCalledWith({
      otpRequestId: 'otp-1',
      userId: OWNER_ID,
      purpose: OtpPurpose.PAYOUT_ACCOUNT_SETUP,
      code: '123456',
      contextHash: payoutAccountSetupContextHash({
        type: 'MOBILE_MONEY',
        mobileMoneyNetwork: 'MTN',
        mobileMoneyNumber: '0551234567',
        freeEntry: false,
      }),
    });
    expect(prisma.payoutAccount.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ provider: 'flutterwave', verificationStatus: 'UNVERIFIED' }),
      }),
    );
    expect((result as { verificationStatus: string }).verificationStatus).toBe('UNVERIFIED');
  });

  it('never creates the account when OTP verification fails', async () => {
    const { controller, prisma, otp } = setup();
    otp.verify.mockRejectedValue(new Error('Invalid or expired code'));

    await expect(controller.create(req, mobileMoneyPayload)).rejects.toThrow(
      'Invalid or expired code',
    );
    expect(prisma.payoutAccount.create).not.toHaveBeenCalled();
  });

  it('saves a free-entry mobile money account with provider=manual', async () => {
    const { controller, prisma } = setup();

    await controller.create(req, { ...mobileMoneyPayload, freeEntry: true });

    expect(prisma.payoutAccount.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ provider: 'manual' }) }),
    );
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
      contextHash: payoutAccountSetupContextHash({
        type: 'STABLECOIN_WALLET',
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

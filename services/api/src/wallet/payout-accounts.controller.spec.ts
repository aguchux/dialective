import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { OtpPurpose } from '@dialectiva/db';
import { PayoutAccountsController } from './payout-accounts.controller';
import { payoutAccountDeleteContextHash } from './otp-context.util';

const OWNER_ID = 'trainer-1';
const ACCOUNT_ID = 'account-1';

function setup(overrides: { account?: Record<string, unknown> | null } = {}) {
  const account =
    'account' in overrides ? overrides.account : { id: ACCOUNT_ID, userId: OWNER_ID, type: 'BANK' };
  const prisma = {
    payoutAccount: {
      findUnique: jest.fn().mockResolvedValue(account),
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
  const controller = new PayoutAccountsController(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    otp as never,
  );
  return { controller, prisma, otp };
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

import { UnprocessableEntityException } from '@nestjs/common';
import { OtpPurpose } from '@dialectiva/db';
import { TrainingEconomyStepUpService } from './training-economy-step-up.service';
import { adminActionContextHash } from '../wallet/otp-context.util';

const ADMIN = { user: { sub: 'admin-1' } };

/**
 * The step-up on the training-economy switch.
 *
 * This is the one field on the settings PATCH that starts or stops money
 * moving for every trainer at once, so what matters here is not that a code
 * is asked for, but that the RIGHT code is: one bound to the direction, and
 * demanded only when the value actually changes.
 */
describe('Training economy step-up', () => {
  let service: TrainingEconomyStepUpService;
  let settings: {
    isTrainingEconomyEnabled: jest.Mock;
    isAdminPayoutOtpEnabled: jest.Mock;
    update: jest.Mock;
    getForAdmin: jest.Mock;
  };
  let otp: { issueForUser: jest.Mock; verify: jest.Mock };
  let prisma: { user: { findUniqueOrThrow: jest.Mock } };

  beforeEach(() => {
    settings = {
      isTrainingEconomyEnabled: jest.fn().mockResolvedValue(true),
      isAdminPayoutOtpEnabled: jest.fn().mockResolvedValue(true),
      update: jest.fn().mockResolvedValue({}),
      getForAdmin: jest.fn().mockResolvedValue({}),
    };
    otp = {
      issueForUser: jest.fn().mockResolvedValue({ otpRequestId: 'otp-1', expiresInSeconds: 600 }),
      verify: jest.fn().mockResolvedValue(undefined),
    };
    prisma = {
      user: {
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValue({ id: 'admin-1', email: 'admin@example.com', phone: null }),
      },
    };

    service = new TrainingEconomyStepUpService(
      prisma as never,
      otp as never,
      settings as never,
    );
  });

  it('issues a code bound to the direction being applied', async () => {
    await service.requestOtp(ADMIN.user.sub, false);

    expect(otp.issueForUser).toHaveBeenCalledWith(
      'admin-1',
      OtpPurpose.TRAINING_ECONOMY_TOGGLE,
      expect.anything(),
      adminActionContextHash({ action: 'training-economy-toggle', direction: 'disable' }),
      expect.anything(),
    );
  });

  it('issues a different hash for each direction', async () => {
    // The whole point of binding the direction: a code issued to stop
    // payouts must not be replayable to resume them.
    const disable = adminActionContextHash({
      action: 'training-economy-toggle',
      direction: 'disable',
    });
    const enable = adminActionContextHash({
      action: 'training-economy-toggle',
      direction: 'enable',
    });

    expect(disable).not.toEqual(enable);
  });

  it('refuses to change the flag without a code', async () => {
    await expect(service.apply(ADMIN.user.sub, { enabled: false })).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
    expect(settings.update).not.toHaveBeenCalled();
  });

  it('verifies against the direction being applied, not the current value', async () => {
    await service.apply(ADMIN.user.sub, {
      enabled: false,
      otpRequestId: 'otp-1',
      code: '123456',
    });

    expect(otp.verify).toHaveBeenCalledWith(
      expect.objectContaining({
        purpose: OtpPurpose.TRAINING_ECONOMY_TOGGLE,
        contextHash: adminActionContextHash({
          action: 'training-economy-toggle',
          direction: 'disable',
        }),
      }),
    );
    expect(settings.update).toHaveBeenCalled();
  });

  it('does not demand a code when the value is unchanged', async () => {
    // A PATCH that resends the current value alongside an unrelated edit is
    // not a toggle. Demanding a code for it would train admins to treat the
    // prompt as noise.
    settings.isTrainingEconomyEnabled.mockResolvedValue(true);

    await service.apply(ADMIN.user.sub, { enabled: true });

    expect(otp.verify).not.toHaveBeenCalled();
    // A no-op returns current state rather than writing.
    expect(settings.update).not.toHaveBeenCalled();
  });

  it('skips the step-up when admin OTP is switched off platform-wide', async () => {
    // Same gate as every other admin step-up, so an admin who turns admin
    // OTP off is not locked out by a code they can no longer receive.
    settings.isAdminPayoutOtpEnabled.mockResolvedValue(false);

    await service.apply(ADMIN.user.sub, { enabled: false });

    expect(otp.verify).not.toHaveBeenCalled();
    expect(settings.update).toHaveBeenCalled();
  });

  it('does not apply the change when the code is rejected', async () => {
    otp.verify.mockRejectedValue(new UnprocessableEntityException('bad code'));

    await expect(
      service.apply(ADMIN.user.sub, {
        enabled: false,
        otpRequestId: 'otp-1',
        code: '000000',
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(settings.update).not.toHaveBeenCalled();
  });
});

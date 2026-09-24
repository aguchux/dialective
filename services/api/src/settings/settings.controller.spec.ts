import { UnprocessableEntityException } from '@nestjs/common';
import { OtpPurpose } from '@dialectiva/db';
import { SettingsController } from './settings.controller';
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
describe('SettingsController training economy step-up', () => {
  let controller: SettingsController;
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

    controller = new SettingsController(
      settings as never,
      prisma as never,
      otp as never,
    );
  });

  it('issues a code bound to the direction being applied', async () => {
    await controller.requestTrainingEconomyOtp({ enabling: false }, ADMIN as never);

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
    await expect(
      controller.updateSettings({ trainingEconomyEnabled: false } as never, ADMIN as never),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(settings.update).not.toHaveBeenCalled();
  });

  it('verifies against the direction being applied, not the current value', async () => {
    await controller.updateSettings(
      {
        trainingEconomyEnabled: false,
        trainingEconomyOtpRequestId: 'otp-1',
        trainingEconomyOtpCode: '123456',
      } as never,
      ADMIN as never,
    );

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

    await controller.updateSettings(
      { trainingEconomyEnabled: true, tokenUsdRate: 2 } as never,
      ADMIN as never,
    );

    expect(otp.verify).not.toHaveBeenCalled();
    expect(settings.update).toHaveBeenCalled();
  });

  it('does not demand a code for unrelated settings', async () => {
    await controller.updateSettings({ tokenUsdRate: 2 } as never, ADMIN as never);

    expect(otp.verify).not.toHaveBeenCalled();
    expect(settings.update).toHaveBeenCalled();
  });

  it('skips the step-up when admin OTP is switched off platform-wide', async () => {
    // Same gate as every other admin step-up, so an admin who turns admin
    // OTP off is not locked out by a code they can no longer receive.
    settings.isAdminPayoutOtpEnabled.mockResolvedValue(false);

    await controller.updateSettings(
      { trainingEconomyEnabled: false } as never,
      ADMIN as never,
    );

    expect(otp.verify).not.toHaveBeenCalled();
    expect(settings.update).toHaveBeenCalled();
  });

  it('does not apply the change when the code is rejected', async () => {
    otp.verify.mockRejectedValue(new UnprocessableEntityException('bad code'));

    await expect(
      controller.updateSettings(
        {
          trainingEconomyEnabled: false,
          trainingEconomyOtpRequestId: 'otp-1',
          trainingEconomyOtpCode: '000000',
        } as never,
        ADMIN as never,
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(settings.update).not.toHaveBeenCalled();
  });
});

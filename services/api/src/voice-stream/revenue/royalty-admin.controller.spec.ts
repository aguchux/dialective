import { RoyaltyAdminController } from './royalty-admin.controller';

/**
 * Admin controls for money-moving switches.
 *
 * The three properties that matter: each change is step-upped independently, the
 * step-up is direction-bound so a code cannot be replayed the other way, and a
 * rate change never writes PlatformSettings -- it schedules a future period, or
 * section 5.4's "never retroactive" promise is not kept.
 */
function setup(
  options: {
    adminOtpEnabled?: boolean;
    royaltiesEnabled?: boolean;
    shadowMode?: boolean;
    poolCount?: number;
  } = {},
) {
  const prisma = {
    user: { findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'admin-1', email: 'a@b.c' }) },
    royaltyRatePeriod: { findMany: jest.fn().mockResolvedValue([]) },
    royaltyPool: { count: jest.fn().mockResolvedValue(options.poolCount ?? 5) },
  };
  const settings = {
    areRoyaltiesEnabled: jest.fn().mockResolvedValue(options.royaltiesEnabled ?? false),
    isRoyaltyShadowMode: jest.fn().mockResolvedValue(options.shadowMode ?? true),
    getRoyaltySharePercent: jest.fn().mockResolvedValue(30),
    getRoyaltyMinimumPayout: jest.fn().mockResolvedValue(500),
    getRoyaltyMaxRunAccrualDl: jest.fn().mockResolvedValue(100000),
    isAdminPayoutOtpEnabled: jest.fn().mockResolvedValue(options.adminOtpEnabled ?? true),
    update: jest.fn().mockResolvedValue({}),
    getSmsOtpSettings: jest.fn().mockResolvedValue({ enabled: false }),
  };
  const otp = {
    issueForUser: jest.fn().mockResolvedValue({ otpRequestId: 'otp-1', expiresInSeconds: 600 }),
    verify: jest.fn().mockResolvedValue({ id: 'otp-1' }),
  };
  const rates = {
    scheduleChange: jest.fn().mockResolvedValue(new Date('2026-04-01T00:00:00.000Z')),
  };
  const controller = new RoyaltyAdminController(
    prisma as never,
    settings as never,
    otp as never,
    rates as never,
  );
  return { prisma, settings, otp, rates, controller };
}

const REQ = { user: { sub: 'admin-1' } };

describe('RoyaltyAdminController: step-up is required', () => {
  it('refuses to enable royalties without a code', async () => {
    const { controller } = setup({ royaltiesEnabled: false });

    await expect(
      controller.applyEnabled(REQ, { enabled: true }),
    ).rejects.toThrow('Confirm this change');
  });

  it('refuses to leave shadow mode without a code', async () => {
    // The highest-consequence switch in the engine.
    const { controller } = setup({ shadowMode: true });

    await expect(
      controller.applyShadowMode(REQ, { enabled: false }),
    ).rejects.toThrow('Confirm this change');
  });

  it('refuses to schedule a rate change without a code', async () => {
    const { controller, rates } = setup();

    await expect(controller.scheduleRate(REQ, { sharePercent: 45 })).rejects.toThrow(
      'Confirm this change',
    );
    expect(rates.scheduleChange).not.toHaveBeenCalled();
  });

  it('skips the step-up when admin OTP is switched off platform-wide', async () => {
    // So an admin who disabled admin OTP is not locked out by a code they can
    // no longer receive -- same rule as every other admin step-up here.
    const { controller, settings } = setup({ adminOtpEnabled: false, royaltiesEnabled: false });

    await controller.applyEnabled(REQ, { enabled: true });

    expect(settings.update).toHaveBeenCalledWith({ royaltiesEnabled: true });
  });

  it('treats a no-op request as a no-op, without demanding a code', async () => {
    // Demanding a code for a change that changes nothing trains admins to treat
    // the prompt as noise.
    const { controller, settings, otp } = setup({ royaltiesEnabled: true });

    await controller.applyEnabled(REQ, { enabled: true });

    expect(otp.verify).not.toHaveBeenCalled();
    expect(settings.update).not.toHaveBeenCalled();
  });
});

describe('RoyaltyAdminController: the step-up is direction-bound', () => {
  it('binds enabling and disabling to different hashes', async () => {
    const { controller, otp } = setup();

    await controller.requestEnabledOtp(REQ, { enabling: true });
    await controller.requestEnabledOtp(REQ, { enabling: false });

    const [enableHash, disableHash] = otp.issueForUser.mock.calls.map((c) => c[3]);
    expect(enableHash).not.toBe(disableHash);
  });

  it('binds shadow mode separately from the royalties switch', async () => {
    // Different blast radii. A code for one must never apply to the other.
    const { controller, otp } = setup();

    await controller.requestEnabledOtp(REQ, { enabling: true });
    await controller.requestShadowModeOtp(REQ, { enabling: true });

    const [a, b] = otp.issueForUser.mock.calls.map((c) => c[3]);
    expect(a).not.toBe(b);
  });

  it('binds a rate code to the rate, so it cannot schedule a different one', async () => {
    const { controller, otp } = setup();

    await controller.requestRateOtp(REQ, { sharePercent: 45 });
    await controller.requestRateOtp(REQ, { sharePercent: 20 });

    const [a, b] = otp.issueForUser.mock.calls.map((c) => c[3]);
    expect(a).not.toBe(b);
  });
});

describe('RoyaltyAdminController: leaving shadow mode', () => {
  it('refuses while no pool has ever been computed', async () => {
    // Section 7: the split rule must not handle money on its first ever run.
    const { controller } = setup({ shadowMode: true, poolCount: 0 });

    await expect(
      controller.applyShadowMode(REQ, { enabled: false, otpRequestId: 'o', code: 'c' }),
    ).rejects.toThrow('at least one full period');
  });

  it('allows it once pools exist', async () => {
    const { controller, settings } = setup({ shadowMode: true, poolCount: 3 });

    await controller.applyShadowMode(REQ, {
      enabled: false,
      otpRequestId: 'o',
      code: 'c',
    });

    expect(settings.update).toHaveBeenCalledWith({ royaltyShadowMode: false });
  });

  it('never blocks RE-ENTERING shadow mode, which is the emergency stop', async () => {
    // Going back in is always safe and must never be gated on pool history.
    const { controller, settings } = setup({ shadowMode: false, poolCount: 0 });

    await controller.applyShadowMode(REQ, { enabled: true, otpRequestId: 'o', code: 'c' });

    expect(settings.update).toHaveBeenCalledWith({ royaltyShadowMode: true });
  });
});

describe('RoyaltyAdminController: a rate change is never retroactive', () => {
  it('schedules a future period and never writes the settings column', async () => {
    // THE 5.4 guarantee. Writing royaltySharePercent would let a late
    // settlement reprice usage already streamed under the old rate.
    const { controller, settings, rates } = setup();

    await controller.scheduleRate(REQ, {
      sharePercent: 45,
      otpRequestId: 'o',
      code: 'c',
    });

    expect(rates.scheduleChange).toHaveBeenCalledWith(45, 'admin-1');
    expect(settings.update).not.toHaveBeenCalled();
  });

  it('reports the configured rate as a seed, distinct from the live schedule', async () => {
    const { controller } = setup();

    const result = await controller.getSettings();

    expect(result.configuredSharePercent).toBe('30');
    expect(result.rateSchedule).toEqual([]);
  });
});

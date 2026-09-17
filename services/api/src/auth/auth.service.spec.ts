process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'test-secret';

jest.mock('@dialectiva/db', () => ({
  ...jest.requireActual('@dialectiva/db'),
  creditStartupBonus: jest.fn(),
  mintStartupBonusOps: jest.fn().mockResolvedValue({ ops: [] }),
}));
import { creditStartupBonus, mintStartupBonusOps, Prisma } from '@dialectiva/db';
import {
  ConflictException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { AuthMaintenanceException } from './auth-maintenance.exception';
import { hashToken } from './token.util';
import { hashOtpCode } from '../otp/otp.util';

function setup(
  maintenance: {
    enabled: boolean;
    until?: Date;
    message?: string | null;
    blockLogin?: boolean;
    blockSignup?: boolean;
  } = { enabled: false },
) {
  const prisma = {
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      upsert: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    linkedAccount: { findUnique: jest.fn(), create: jest.fn() },
    referralInvite: { findMany: jest.fn().mockResolvedValue([]) },
    emailVerificationToken: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    passwordResetToken: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    otpCode: { findUnique: jest.fn(), update: jest.fn() },
    refreshToken: { create: jest.fn(), updateMany: jest.fn() },
    manualPhoneVerificationRequest: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    wallet: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    ledgerEntry: { create: jest.fn() },
    wordRecording: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { tokensSpent: null }, _count: 0 }),
    },
    dialect: { findUnique: jest.fn() },
    dialectVariant: { findUnique: jest.fn() },
    country: { findUnique: jest.fn() },
    $transaction: undefined as unknown as jest.Mock,
  };
  prisma.$transaction = jest.fn(async (ops: unknown) => {
    if (typeof ops === 'function') return (ops as (tx: unknown) => unknown)(prisma);
    return Promise.all(ops as Promise<unknown>[]);
  });
  const mail = {
    sendMagicLinkEmail: jest.fn(),
    sendEmailVerificationEmail: jest.fn(),
    sendReferralJoinNotification: jest.fn(),
    sendPasswordResetEmail: jest.fn(),
    sendPhoneVerifiedEmail: jest.fn(),
    sendAuditHoldReleasedEmail: jest.fn().mockResolvedValue(undefined),
  };
  const otp = {
    issueWithTicket: jest.fn().mockResolvedValue({ ticket: 'ticket-1', expiresInSeconds: 600 }),
    issueForUser: jest
      .fn()
      .mockResolvedValue({ otpRequestId: 'otp-request-1', expiresInSeconds: 600 }),
    verifyWithoutConsuming: jest.fn(),
    verify: jest.fn(),
  };
  const platformSettings = {
    getAuthMaintenanceStatus: jest.fn().mockResolvedValue(
      maintenance.enabled
        ? {
            enabled: true,
            until: maintenance.until ?? new Date(Date.now() + 60_000),
            message: maintenance.message ?? null,
            blockLogin: maintenance.blockLogin ?? true,
            blockSignup: maintenance.blockSignup ?? true,
            blockSessions: false,
            excludeAdmin: true,
            excludePartner: false,
          }
        : {
            enabled: false,
            until: null,
            message: null,
            blockLogin: false,
            blockSignup: false,
            blockSessions: false,
            excludeAdmin: true,
            excludePartner: false,
          },
    ),
    getStartupBonusAmount: jest.fn().mockResolvedValue(0),
    getManualPhoneVerificationSettings: jest
      .fn()
      .mockResolvedValue({
        enabled: true,
        feeTokens: 1,
        whatsappNumber: '1234567890',
        expiryMinutes: 30,
      }),
    isAdminPayoutOtpEnabled: jest.fn().mockResolvedValue(false),
    getOtpChannel: jest.fn().mockResolvedValue('sms'),
    isWhatsappOtpEnabled: jest.fn().mockResolvedValue(false),
  };
  const p2p = { adminCancelAllForUser: jest.fn() };
  const storage = { deleteObject: jest.fn() };
  const tokenomics = { isMintingPaused: jest.fn().mockResolvedValue(false) };
  const marketing = { recordRegistration: jest.fn().mockResolvedValue(undefined) };
  const service = new AuthService(
    prisma as never,
    mail as never,
    otp as never,
    platformSettings as never,
    p2p as never,
    storage as never,
    tokenomics as never,
    marketing as never,
  );
  return { service, prisma, mail, otp, platformSettings, storage, tokenomics, marketing };
}

describe('AuthService auth maintenance gate', () => {
  it('register rejects with AuthMaintenanceException while signup is blocked', async () => {
    const { service, prisma } = setup({ enabled: true, message: 'Upgrading' });
    await expect(service.register('a@b.com', 'password123', 'A', 'B')).rejects.toThrow(
      AuthMaintenanceException,
    );
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('login rejects with AuthMaintenanceException while login is blocked', async () => {
    const { service, prisma } = setup({ enabled: true });
    const passwordHash = await bcrypt.hash('password123', 4);
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      passwordHash,
      status: 'ACTIVE',
      role: 'TRAINER',
    });
    await expect(service.login('a@b.com', 'password123')).rejects.toThrow(AuthMaintenanceException);
  });

  it('login exempts an admin from the maintenance block when excludeAdmin is on', async () => {
    const { service, prisma } = setup({ enabled: true });
    const passwordHash = await bcrypt.hash('password123', 4);
    prisma.user.findUnique.mockResolvedValue({
      id: 'admin-1',
      email: 'admin@example.com',
      passwordHash,
      status: 'ACTIVE',
      role: 'ADMIN',
      twoFactorEmailEnabled: false,
      twoFactorSmsEnabled: false,
    });
    const result = await service.login('admin@example.com', 'password123');
    expect(result).not.toBeInstanceOf(Error);
  });

  it('login still rejects a wrong password for an admin during maintenance with the same generic error, not the maintenance exception', async () => {
    const { service, prisma } = setup({ enabled: true });
    const passwordHash = await bcrypt.hash('password123', 4);
    prisma.user.findUnique.mockResolvedValue({
      id: 'admin-1',
      email: 'admin@example.com',
      passwordHash,
      status: 'ACTIVE',
      role: 'ADMIN',
    });
    let caught: unknown;
    try {
      await service.login('admin@example.com', 'wrong-password');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(UnauthorizedException);
    expect(caught).not.toBeInstanceOf(AuthMaintenanceException);
  });

  it('requestMagicLink rejects with AuthMaintenanceException while signup is blocked', async () => {
    const { service, prisma, mail } = setup({ enabled: true });
    await expect(service.requestMagicLink('a@b.com')).rejects.toThrow(AuthMaintenanceException);
    expect(prisma.user.upsert).not.toHaveBeenCalled();
    expect(mail.sendMagicLinkEmail).not.toHaveBeenCalled();
  });

  it('login is not blocked when only signup is checked off', async () => {
    const { service, prisma } = setup({ enabled: true, blockLogin: false, blockSignup: true });
    // No passwordHash on the found user -> login fails with a normal
    // "invalid credentials" error, not AuthMaintenanceException, which
    // proves assertNotInAuthMaintenance('login') did not throw first.
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', passwordHash: null, status: 'ACTIVE' });
    let caught: unknown;
    try {
      await service.login('a@b.com', 'password123');
    } catch (err) {
      caught = err;
    }
    expect(caught).not.toBeInstanceOf(AuthMaintenanceException);
    expect(prisma.user.findUnique).toHaveBeenCalled();
  });

  it('does not gate when maintenance is disabled', async () => {
    const { service, prisma } = setup({ enabled: false });
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({ id: 'u1', email: 'a@b.com', referralCode: 'ref1' });

    await service.register('a@b.com', 'password123', 'A', 'B');
    expect(prisma.user.findUnique).toHaveBeenCalled();
  });
});

describe('AuthService trainer ratings', () => {
  it('records a trainer rating and the reviewing admin', async () => {
    const { service, prisma } = setup();
    prisma.user.findUnique.mockResolvedValue({ id: 'trainer-1', role: 'TRAINER' });
    prisma.user.update.mockResolvedValue({
      id: 'trainer-1',
      email: 'trainer@example.com',
      role: 'TRAINER',
      status: 'ACTIVE',
      referralCode: 'trainer-code',
      trainerRating: 'EXCELLENT',
      auditHoldAt: null,
      auditHoldReleasedAt: null,
    });

    const result = await service.updateTrainerRating('admin-1', 'trainer-1', 'EXCELLENT' as never);

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'trainer-1' },
        data: expect.objectContaining({
          trainerRating: 'EXCELLENT',
          trainerRatingUpdatedById: 'admin-1',
        }),
      }),
    );
    expect(result).toMatchObject({ trainerRating: 'EXCELLENT', trainerRatingValue: 5 });
  });

  it('maps VERY_BAD to the bottom of the 5-star scale', async () => {
    const { service, prisma } = setup();
    prisma.user.findUnique.mockResolvedValue({ id: 'trainer-1', role: 'TRAINER' });
    prisma.user.update.mockResolvedValue({
      id: 'trainer-1',
      email: 'trainer@example.com',
      role: 'TRAINER',
      status: 'ACTIVE',
      referralCode: 'trainer-code',
      trainerRating: 'VERY_BAD',
      auditHoldAt: null,
      auditHoldReleasedAt: null,
    });

    const result = await service.updateTrainerRating('admin-1', 'trainer-1', 'VERY_BAD' as never);

    expect(result).toMatchObject({ trainerRating: 'VERY_BAD', trainerRatingValue: 1 });
  });

  it('rejects a rating for an account that is not a trainer', async () => {
    const { service, prisma } = setup();
    prisma.user.findUnique.mockResolvedValue({ id: 'admin-2', role: 'ADMIN' });

    await expect(
      service.updateTrainerRating('admin-1', 'admin-2', 'GOOD' as never),
    ).rejects.toThrow('Only trainers can receive a trainer quality rating');
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});

describe('AuthService.updateUserRole', () => {
  it('defaults validatorLevel to L1 when a user is promoted to VALIDATOR', async () => {
    const { service, prisma } = setup();
    prisma.user.update.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      role: 'VALIDATOR',
      status: 'ACTIVE',
      validatorLevel: 'L1',
    });

    await service.updateUserRole('user-1', 'VALIDATOR' as never);

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-1' },
        data: expect.objectContaining({ role: 'VALIDATOR', validatorLevel: 'L1' }),
      }),
    );
  });

  it('clears validatorLevel when a user is moved away from VALIDATOR', async () => {
    const { service, prisma } = setup();
    prisma.user.update.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      role: 'TRAINER',
      status: 'ACTIVE',
      validatorLevel: null,
    });

    await service.updateUserRole('user-1', 'TRAINER' as never);

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-1' },
        data: expect.objectContaining({ role: 'TRAINER', validatorLevel: null }),
      }),
    );
  });
});

describe('AuthService.getAdminUser', () => {
  function fakeUser(overrides: Record<string, unknown> = {}) {
    return {
      id: 'trainer-1',
      email: 'trainer@example.com',
      role: 'TRAINER',
      status: 'ACTIVE',
      referralCode: 'trainer-code',
      trainerRating: null,
      firstName: null,
      lastName: null,
      auditHoldAt: null,
      auditHoldReleasedAt: null,
      wallet: { balance: new Prisma.Decimal(10), lockedBalance: new Prisma.Decimal(3) },
      _count: { wordRecordings: 5 },
      ...overrides,
    };
  }

  it('reports wallet total as balance + lockedBalance', async () => {
    const { service, prisma } = setup();
    prisma.user.findUnique.mockResolvedValue(fakeUser());

    const result = await service.getAdminUser('trainer-1');

    expect(result.walletBalance).toBe('10');
    expect(result.walletLockedBalance).toBe('3');
    expect(result.walletTotalBalance).toBe('13');
  });

  it('sums PENDING and SCORED, not-yet-settled recordings as pending-scoring tokens', async () => {
    const { service, prisma } = setup();
    prisma.user.findUnique.mockResolvedValue(fakeUser());
    prisma.wordRecording.aggregate.mockResolvedValue({
      _sum: { tokensSpent: new Prisma.Decimal(7.5) },
      _count: 2,
    });

    const result = await service.getAdminUser('trainer-1');

    expect(prisma.wordRecording.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'trainer-1', status: { in: ['PENDING', 'SCORED'] }, settledAt: null },
      }),
    );
    expect(result.pendingScoringTokens).toBe('7.5');
    expect(result.pendingScoringCount).toBe(2);
  });

  it('reports zero pending-scoring tokens when nothing is outstanding', async () => {
    const { service, prisma } = setup();
    prisma.user.findUnique.mockResolvedValue(fakeUser());

    const result = await service.getAdminUser('trainer-1');

    expect(result.pendingScoringTokens).toBe('0');
    expect(result.pendingScoringCount).toBe(0);
  });
});

describe('AuthService register campaign attribution', () => {
  it('records marketing campaign registration when a campaignShareId is provided', async () => {
    const { service, prisma, marketing } = setup({ enabled: false });
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({ id: 'user-1', email: 'a@b.com', referralCode: 'ref1' });

    await service.register('a@b.com', 'password123', 'A', 'B', undefined, 'share-1');

    expect(marketing.recordRegistration).toHaveBeenCalledWith('share-1', 'user-1');
  });

  it('does not call recordRegistration when no campaignShareId is provided', async () => {
    const { service, prisma, marketing } = setup({ enabled: false });
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({ id: 'user-1', email: 'a@b.com', referralCode: 'ref1' });

    await service.register('a@b.com', 'password123', 'A', 'B');

    expect(marketing.recordRegistration).not.toHaveBeenCalled();
  });
});

describe('AuthService verifyEmail startup bonus', () => {
  function setupToken(prisma: ReturnType<typeof setup>['prisma']) {
    prisma.emailVerificationToken.findUnique.mockResolvedValue({
      id: 'token-1',
      userId: 'user-1',
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    // updateMany's returned count is what verifyEmail uses to decide
    // whether this was the first verification -- default to "1 row
    // matched" (user.emailVerified was null), matching a normal first-time
    // verify.
    prisma.user.updateMany.mockResolvedValue({ count: 1 });
  }

  beforeEach(() => {
    (creditStartupBonus as jest.Mock).mockReset().mockResolvedValue(undefined);
    (mintStartupBonusOps as jest.Mock).mockReset().mockResolvedValue({ ops: [] });
  });

  it('grants the startup bonus on a first-time verification when an amount is configured', async () => {
    const { service, prisma, platformSettings } = setup();
    setupToken(prisma);
    platformSettings.getStartupBonusAmount.mockResolvedValue(25);

    await service.verifyEmail('raw-token');

    expect(creditStartupBonus).toHaveBeenCalledWith(prisma, 'user-1', 25, 'signup-verification');
  });

  it('also mints the bonus into the Tokenomics engine when minting is not paused', async () => {
    const { service, prisma, platformSettings, tokenomics } = setup();
    setupToken(prisma);
    platformSettings.getStartupBonusAmount.mockResolvedValue(25);
    tokenomics.isMintingPaused.mockResolvedValue(false);
    (mintStartupBonusOps as jest.Mock).mockResolvedValue({ ops: ['mint-op'] });

    await service.verifyEmail('raw-token');

    expect(mintStartupBonusOps).toHaveBeenCalledWith(
      prisma,
      'user-1',
      25,
      'signup-verification:user-1',
    );
    expect(prisma.$transaction).toHaveBeenCalledWith(['mint-op']);
  });

  it('skips the Tokenomics mint (but still pays the legacy bonus) when minting is paused', async () => {
    const { service, prisma, platformSettings, tokenomics } = setup();
    setupToken(prisma);
    platformSettings.getStartupBonusAmount.mockResolvedValue(25);
    tokenomics.isMintingPaused.mockResolvedValue(true);

    await service.verifyEmail('raw-token');

    expect(creditStartupBonus).toHaveBeenCalled();
    expect(mintStartupBonusOps).not.toHaveBeenCalled();
  });

  it('does not grant a bonus when the configured amount is 0 (off)', async () => {
    const { service, prisma, platformSettings } = setup();
    setupToken(prisma);
    platformSettings.getStartupBonusAmount.mockResolvedValue(0);

    await service.verifyEmail('raw-token');

    expect(creditStartupBonus).not.toHaveBeenCalled();
  });

  it('does not grant a bonus when updateMany matched no rows (already verified -- not a first-time verification)', async () => {
    const { service, prisma, platformSettings } = setup();
    setupToken(prisma);
    prisma.user.updateMany.mockResolvedValue({ count: 0 });
    platformSettings.getStartupBonusAmount.mockResolvedValue(25);

    await service.verifyEmail('raw-token');

    expect(creditStartupBonus).not.toHaveBeenCalled();
  });
});

describe('AuthService verifyOtp (registration) startup bonus', () => {
  function setupTicket(
    prisma: ReturnType<typeof setup>['prisma'],
    otp: ReturnType<typeof setup>['otp'],
  ) {
    prisma.otpCode.findUnique.mockResolvedValue({ purpose: 'REGISTRATION' });
    otp.verifyWithoutConsuming.mockResolvedValue({ id: 'otp-1', userId: 'user-1' });
    // Same "count matched" convention as verifyEmail's updateMany guard --
    // default to "1 row matched" (a normal first-time verify).
    prisma.user.updateMany.mockResolvedValue({ count: 1 });
    prisma.user.findUniqueOrThrow.mockResolvedValue({
      id: 'user-1',
      email: 'a@b.com',
      referredById: null,
    });
  }

  beforeEach(() => {
    (creditStartupBonus as jest.Mock).mockReset().mockResolvedValue(undefined);
    (mintStartupBonusOps as jest.Mock).mockReset().mockResolvedValue({ ops: [] });
  });

  it('grants the startup bonus on a first-time OTP verification when an amount is configured', async () => {
    const { service, prisma, otp, platformSettings } = setup();
    setupTicket(prisma, otp);
    platformSettings.getStartupBonusAmount.mockResolvedValue(25);

    await service.verifyOtp('ticket-1', '123456');

    expect(creditStartupBonus).toHaveBeenCalledWith(prisma, 'user-1', 25, 'signup-verification');
  });

  it('does not grant a bonus when the configured amount is 0 (off)', async () => {
    const { service, prisma, otp, platformSettings } = setup();
    setupTicket(prisma, otp);
    platformSettings.getStartupBonusAmount.mockResolvedValue(0);

    await service.verifyOtp('ticket-1', '123456');

    expect(creditStartupBonus).not.toHaveBeenCalled();
  });

  it('does not grant a bonus when updateMany matched no rows (already verified -- not a first-time verification)', async () => {
    const { service, prisma, otp, platformSettings } = setup();
    setupTicket(prisma, otp);
    prisma.user.updateMany.mockResolvedValue({ count: 0 });
    platformSettings.getStartupBonusAmount.mockResolvedValue(25);

    await service.verifyOtp('ticket-1', '123456');

    expect(creditStartupBonus).not.toHaveBeenCalled();
  });
});

describe('AuthService consumeMagicLink startup bonus', () => {
  function setupMagicLink(prisma: ReturnType<typeof setup>['prisma']) {
    prisma.emailVerificationToken.findUnique.mockResolvedValue({
      id: 'token-1',
      userId: 'user-1',
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    prisma.user.updateMany.mockResolvedValue({ count: 1 });
    prisma.user.findUniqueOrThrow.mockResolvedValue({
      id: 'user-1',
      email: 'a@b.com',
      role: 'TRAINER',
      status: 'ACTIVE',
      firstName: null,
      lastName: null,
      emailVerified: new Date(),
      phoneNumber: null,
      phoneVerifiedAt: null,
      countryId: null,
      dialectId: null,
      dialectVariantId: null,
      referralCode: 'ref1',
      emailNotificationsEnabled: true,
      smsNotificationsEnabled: true,
      marketingNotificationsEnabled: false,
      blogNewsNotificationsEnabled: false,
    });
    prisma.linkedAccount.findUnique.mockResolvedValue(null);
    prisma.linkedAccount.create.mockResolvedValue({ id: 'linked-1' });
    prisma.refreshToken.create.mockResolvedValue({ id: 'refresh-1' });
  }

  beforeEach(() => {
    (creditStartupBonus as jest.Mock).mockReset().mockResolvedValue(undefined);
    (mintStartupBonusOps as jest.Mock).mockReset().mockResolvedValue({ ops: [] });
  });

  it('grants the startup bonus when a magic-link signup verifies email for the first time', async () => {
    const { service, prisma, platformSettings } = setup();
    setupMagicLink(prisma);
    platformSettings.getStartupBonusAmount.mockResolvedValue(25);

    await service.consumeMagicLink('raw-token');

    expect(creditStartupBonus).toHaveBeenCalledWith(prisma, 'user-1', 25, 'signup-verification');
  });

  it('does not grant a startup bonus when the magic-link user was already verified', async () => {
    const { service, prisma, platformSettings } = setup();
    setupMagicLink(prisma);
    prisma.user.updateMany.mockResolvedValue({ count: 0 });
    platformSettings.getStartupBonusAmount.mockResolvedValue(25);

    await service.consumeMagicLink('raw-token');

    expect(creditStartupBonus).not.toHaveBeenCalled();
  });
});

describe('AuthService.requestPasswordReset', () => {
  it('creates a token and emails the user when the email matches an account', async () => {
    const { service, prisma, mail } = setup();
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'a@b.com' });

    await service.requestPasswordReset('a@b.com');

    expect(prisma.passwordResetToken.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: 'user-1' }) }),
    );
    expect(mail.sendPasswordResetEmail).toHaveBeenCalledWith('a@b.com', expect.any(String));
  });

  it('does not reveal whether the email exists -- no token, no email, no error', async () => {
    const { service, prisma, mail } = setup();
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(service.requestPasswordReset('nobody@b.com')).resolves.toBeUndefined();

    expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
    expect(mail.sendPasswordResetEmail).not.toHaveBeenCalled();
  });
});

describe('AuthService.resetPassword', () => {
  function setupToken(
    prisma: ReturnType<typeof setup>['prisma'],
    overrides: Partial<{ usedAt: Date | null; expiresAt: Date }> = {},
  ) {
    prisma.passwordResetToken.findUnique.mockResolvedValue({
      id: 'token-1',
      userId: 'user-1',
      usedAt: overrides.usedAt ?? null,
      expiresAt: overrides.expiresAt ?? new Date(Date.now() + 60_000),
    });
  }

  it('hashes the new password, marks the token used, and revokes existing sessions', async () => {
    const { service, prisma } = setup();
    setupToken(prisma);

    await service.resetPassword('raw-token', 'new-password-123');

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-1' },
        data: expect.objectContaining({ passwordHash: expect.any(String) }),
      }),
    );
    expect(prisma.passwordResetToken.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'token-1' },
        data: expect.objectContaining({ usedAt: expect.any(Date) }),
      }),
    );
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1', revokedAt: null },
        data: expect.objectContaining({ revokedAt: expect.any(Date) }),
      }),
    );
  });

  it('looks the token up by its sha256 hash, not the raw token', async () => {
    const { service, prisma } = setup();
    setupToken(prisma);

    await service.resetPassword('raw-token', 'new-password-123');

    expect(prisma.passwordResetToken.findUnique).toHaveBeenCalledWith({
      where: { tokenHash: hashToken('raw-token') },
    });
  });

  it('rejects an unknown token', async () => {
    const { service, prisma } = setup();
    prisma.passwordResetToken.findUnique.mockResolvedValue(null);

    await expect(service.resetPassword('raw-token', 'new-password-123')).rejects.toThrow(
      UnauthorizedException,
    );
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('rejects an already-used token', async () => {
    const { service, prisma } = setup();
    setupToken(prisma, { usedAt: new Date() });

    await expect(service.resetPassword('raw-token', 'new-password-123')).rejects.toThrow(
      UnauthorizedException,
    );
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('rejects an expired token', async () => {
    const { service, prisma } = setup();
    setupToken(prisma, { expiresAt: new Date(Date.now() - 1000) });

    await expect(service.resetPassword('raw-token', 'new-password-123')).rejects.toThrow(
      UnauthorizedException,
    );
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});

describe('AuthService.requestManualPhoneVerification', () => {
  it('uses the configured code expiry duration', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-29T10:00:00.000Z'));
    try {
      const { service, prisma, platformSettings } = setup();
      platformSettings.getManualPhoneVerificationSettings.mockResolvedValue({
        enabled: true,
        feeTokens: 1,
        whatsappNumber: '1234567890',
        expiryMinutes: 7,
      });
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', phoneVerifiedAt: null });
      prisma.manualPhoneVerificationRequest.updateMany.mockResolvedValue({ count: 0 });
      prisma.manualPhoneVerificationRequest.findFirst.mockResolvedValue(null);

      await service.requestManualPhoneVerification('user-1', '+2348012345678');

      expect(prisma.manualPhoneVerificationRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ expiresAt: new Date('2026-08-29T10:07:00.000Z') }),
        }),
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('rejects a user whose phone is already verified', async () => {
    const { service, prisma } = setup();
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1', phoneVerifiedAt: new Date() });

    await expect(
      service.requestManualPhoneVerification('user-1', '+2348012345678'),
    ).rejects.toThrow(ConflictException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a second request while one is already pending', async () => {
    const { service, prisma } = setup();
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1', phoneVerifiedAt: null });
    prisma.manualPhoneVerificationRequest.updateMany.mockResolvedValue({ count: 0 });
    prisma.manualPhoneVerificationRequest.findFirst.mockResolvedValue({ id: 'existing-request' });

    await expect(
      service.requestManualPhoneVerification('user-1', '+2348012345678'),
    ).rejects.toThrow(ConflictException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('AuthService.verifyManualPhoneVerificationRequest', () => {
  function pendingRequest(
    overrides: Partial<{
      attempts: number;
      maxAttempts: number;
      expiresAt: Date;
      otpHash: string;
    }> = {},
  ) {
    return {
      id: 'request-1',
      userId: 'user-1',
      phoneNumber: '+1234567890',
      otpHash: overrides.otpHash ?? hashOtpCode('123456'),
      status: 'PENDING',
      feeTokenAmount: new Prisma.Decimal(1),
      attempts: overrides.attempts ?? 0,
      maxAttempts: overrides.maxAttempts ?? 5,
      expiresAt: overrides.expiresAt ?? new Date(Date.now() + 60_000),
    };
  }

  it('verifies on a correct code, charges the fee, and marks the user phoneVerified', async () => {
    const { service, prisma, mail } = setup();
    const request = pendingRequest();
    prisma.manualPhoneVerificationRequest.updateMany.mockResolvedValue({ count: 1 }); // the claim inside $transaction
    prisma.manualPhoneVerificationRequest.findUnique.mockResolvedValue(request);
    prisma.wallet.upsert.mockResolvedValue({ id: 'wallet-1' });
    prisma.wallet.updateMany.mockResolvedValue({ count: 1 }); // fee debit succeeds
    prisma.manualPhoneVerificationRequest.findUniqueOrThrow.mockResolvedValue({
      ...request,
      status: 'VERIFIED',
      user: {
        id: 'user-1',
        email: 'a@b.com',
        firstName: null,
        lastName: null,
        phoneNumber: '+1234567890',
        phoneVerifiedAt: new Date(),
      },
      verifiedByAdmin: { id: 'admin-1', email: 'admin@b.com', firstName: null, lastName: null },
    });

    const result = await service.verifyManualPhoneVerificationRequest(
      'admin-1',
      'request-1',
      '123456',
    );

    expect(result.status).toBe('VERIFIED');
    expect(prisma.wallet.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1', balance: { gte: request.feeTokenAmount } },
      }),
    );
    expect(prisma.ledgerEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ walletId: 'wallet-1', type: 'PHONE_VERIFICATION_FEE' }),
      }),
    );
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-1' },
        data: expect.objectContaining({ phoneNumber: '+1234567890' }),
      }),
    );
    expect(mail.sendPhoneVerifiedEmail).toHaveBeenCalledWith('a@b.com', '+1234567890');
  });

  it('blocks verification when the trainer has insufficient DL for the fee, leaving the request PENDING', async () => {
    const { service, prisma } = setup();
    const request = pendingRequest();
    prisma.manualPhoneVerificationRequest.updateMany.mockResolvedValue({ count: 1 }); // the claim itself still succeeds
    prisma.manualPhoneVerificationRequest.findUnique.mockResolvedValue(request);
    prisma.wallet.upsert.mockResolvedValue({ id: 'wallet-1' });
    prisma.wallet.updateMany.mockResolvedValue({ count: 0 }); // insufficient balance

    await expect(
      service.verifyManualPhoneVerificationRequest('admin-1', 'request-1', '123456'),
    ).rejects.toThrow(UnprocessableEntityException);

    expect(prisma.ledgerEntry.create).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('rejects a wrong code and increments attempts without changing status', async () => {
    const { service, prisma } = setup();
    prisma.manualPhoneVerificationRequest.updateMany.mockResolvedValue({ count: 0 });
    prisma.manualPhoneVerificationRequest.findUnique.mockResolvedValue(pendingRequest());

    await expect(
      service.verifyManualPhoneVerificationRequest('admin-1', 'request-1', '000000'),
    ).rejects.toThrow(UnauthorizedException);

    expect(prisma.manualPhoneVerificationRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'request-1', status: 'PENDING' },
        data: { attempts: { increment: 1 } },
      }),
    );
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('locks out further attempts once maxAttempts is reached, even with the correct code', async () => {
    const { service, prisma } = setup();
    prisma.manualPhoneVerificationRequest.updateMany.mockResolvedValue({ count: 0 });
    prisma.manualPhoneVerificationRequest.findUnique.mockResolvedValue(
      pendingRequest({ attempts: 5, maxAttempts: 5 }),
    );

    await expect(
      service.verifyManualPhoneVerificationRequest('admin-1', 'request-1', '123456'),
    ).rejects.toThrow(UnauthorizedException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('loses the race cleanly when the request was already resolved concurrently (TOCTOU guard)', async () => {
    const { service, prisma } = setup();
    prisma.manualPhoneVerificationRequest.updateMany.mockResolvedValue({ count: 0 }); // claim fails: another call already resolved it
    prisma.manualPhoneVerificationRequest.findUnique.mockResolvedValue(pendingRequest());

    await expect(
      service.verifyManualPhoneVerificationRequest('admin-1', 'request-1', '123456'),
    ).rejects.toThrow(UnprocessableEntityException);
  });
});

describe('AuthService.confirmManualPhoneVerificationRequest', () => {
  function pendingRequest(overrides: Partial<{ expiresAt: Date }> = {}) {
    return {
      id: 'request-1',
      userId: 'user-1',
      phoneNumber: '+1234567890',
      otpHash: hashOtpCode('123456'),
      status: 'PENDING',
      feeTokenAmount: new Prisma.Decimal(1),
      attempts: 0,
      maxAttempts: 5,
      expiresAt: overrides.expiresAt ?? new Date(Date.now() + 60_000),
    };
  }

  it('verifies without a code, charges the fee, and marks verifiedWithoutCode', async () => {
    const { service, prisma, mail } = setup();
    const request = pendingRequest();
    prisma.manualPhoneVerificationRequest.updateMany.mockResolvedValue({ count: 1 });
    prisma.manualPhoneVerificationRequest.findUnique.mockResolvedValue(request);
    prisma.wallet.upsert.mockResolvedValue({ id: 'wallet-1' });
    prisma.wallet.updateMany.mockResolvedValue({ count: 1 });
    prisma.manualPhoneVerificationRequest.findUniqueOrThrow.mockResolvedValue({
      ...request,
      status: 'VERIFIED',
      verifiedWithoutCode: true,
      user: {
        id: 'user-1',
        email: 'a@b.com',
        firstName: null,
        lastName: null,
        phoneNumber: '+1234567890',
        phoneVerifiedAt: new Date(),
      },
      verifiedByAdmin: { id: 'admin-1', email: 'admin@b.com', firstName: null, lastName: null },
    });

    const result = await service.confirmManualPhoneVerificationRequest('admin-1', 'request-1');

    expect(result.status).toBe('VERIFIED');
    expect(result.verifiedWithoutCode).toBe(true);
    expect(prisma.manualPhoneVerificationRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'request-1', status: 'PENDING' },
        data: expect.objectContaining({ verifiedWithoutCode: true }),
      }),
    );
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-1' },
        data: expect.objectContaining({ phoneNumber: '+1234567890' }),
      }),
    );
    expect(mail.sendPhoneVerifiedEmail).toHaveBeenCalledWith('a@b.com', '+1234567890');
  });

  it('rejects an already-resolved request without needing a code', async () => {
    const { service, prisma } = setup();
    prisma.manualPhoneVerificationRequest.findUnique.mockResolvedValue({
      ...pendingRequest(),
      status: 'REJECTED',
    });

    await expect(
      service.confirmManualPhoneVerificationRequest('admin-1', 'request-1'),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('rejects an expired request', async () => {
    const { service, prisma } = setup();
    prisma.manualPhoneVerificationRequest.findUnique.mockResolvedValue(
      pendingRequest({ expiresAt: new Date(Date.now() - 1000) }),
    );

    await expect(
      service.confirmManualPhoneVerificationRequest('admin-1', 'request-1'),
    ).rejects.toThrow(UnprocessableEntityException);
  });
});

describe('AuthService.rejectManualPhoneVerificationRequest', () => {
  it('rejects the request without touching the wallet -- the fee was never charged', async () => {
    const { service, prisma } = setup();
    const request = {
      id: 'request-1',
      userId: 'user-1',
      phoneNumber: '+1234567890',
      status: 'PENDING',
      feeTokenAmount: new Prisma.Decimal(1),
    };
    prisma.manualPhoneVerificationRequest.findUnique.mockResolvedValue(request);
    prisma.manualPhoneVerificationRequest.updateMany.mockResolvedValue({ count: 1 });
    prisma.manualPhoneVerificationRequest.findUniqueOrThrow.mockResolvedValue({
      ...request,
      status: 'REJECTED',
      user: {
        id: 'user-1',
        email: 'a@b.com',
        firstName: null,
        lastName: null,
        phoneNumber: '+1234567890',
        phoneVerifiedAt: null,
      },
      verifiedByAdmin: { id: 'admin-1', email: 'admin@b.com', firstName: null, lastName: null },
    });

    const result = await service.rejectManualPhoneVerificationRequest('admin-1', 'request-1');

    expect(result.status).toBe('REJECTED');
    expect(prisma.wallet.update).not.toHaveBeenCalled();
    expect(prisma.wallet.updateMany).not.toHaveBeenCalled();
    expect(prisma.ledgerEntry.create).not.toHaveBeenCalled();
  });
});

describe('AuthService.listAuditHoldUsers', () => {
  it('returns only users whose hold is still active, filtering out released ones', async () => {
    const { service, prisma } = setup();
    prisma.user.findMany.mockResolvedValue([
      {
        id: 'user-1',
        email: 'active-hold@b.com',
        auditHoldAt: new Date('2026-01-02'),
        auditHoldReleasedAt: null,
        dialect: null,
        dialectVariant: null,
      },
      {
        id: 'user-2',
        email: 'released@b.com',
        auditHoldAt: new Date('2026-01-01'),
        auditHoldReleasedAt: new Date('2026-01-05'),
        dialect: null,
        dialectVariant: null,
      },
    ]);

    const result = await service.listAuditHoldUsers();

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { auditHoldAt: { not: null } } }),
    );
    expect(result.map((u) => u.id)).toEqual(['user-1']);
    expect(result[0].onAuditHold).toBe(true);
  });

  it('re-includes a user whose hold retriggered after an earlier release', async () => {
    const { service, prisma } = setup();
    prisma.user.findMany.mockResolvedValue([
      {
        id: 'user-1',
        email: 'a@b.com',
        auditHoldAt: new Date('2026-02-01'),
        auditHoldReleasedAt: new Date('2026-01-05'),
        dialect: null,
        dialectVariant: null,
      },
    ]);

    const result = await service.listAuditHoldUsers();

    expect(result.map((u) => u.id)).toEqual(['user-1']);
  });

  it('returns an empty list when no one is on hold', async () => {
    const { service, prisma } = setup();
    prisma.user.findMany.mockResolvedValue([]);

    await expect(service.listAuditHoldUsers()).resolves.toEqual([]);
  });
});

describe('AuthService.releaseAuditHold', () => {
  it('rejects when the account is not currently on an audit hold', async () => {
    const { service, prisma } = setup();
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'a@b.com',
      auditHoldAt: null,
      auditHoldReleasedAt: null,
    });

    await expect(service.releaseAuditHold('admin-1', 'user-1')).rejects.toThrow(
      'not currently on an audit hold',
    );
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('clears the hold, emails the trainer, and never touches status', async () => {
    const { service, prisma, mail } = setup();
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'a@b.com',
      auditHoldAt: new Date('2026-01-01'),
      auditHoldReleasedAt: null,
    });
    prisma.user.update.mockResolvedValue({
      id: 'user-1',
      email: 'a@b.com',
      status: 'ACTIVE',
      auditHoldAt: new Date('2026-01-01'),
      auditHoldReleasedAt: new Date(),
    });

    const result = await service.releaseAuditHold('admin-1', 'user-1');

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-1' },
        data: expect.objectContaining({ auditHoldReleasedById: 'admin-1' }),
      }),
    );
    expect(prisma.user.update.mock.calls[0][0].data).not.toHaveProperty('status');
    expect(mail.sendAuditHoldReleasedEmail).toHaveBeenCalledWith('a@b.com');
    expect(result.onAuditHold).toBe(false);
  });

  it('requires OTP when adminPayoutOtpEnabled is on', async () => {
    const { service, prisma, platformSettings } = setup();
    platformSettings.isAdminPayoutOtpEnabled.mockResolvedValue(true);
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'a@b.com',
      auditHoldAt: new Date(),
      auditHoldReleasedAt: null,
    });

    await expect(service.releaseAuditHold('admin-1', 'user-1')).rejects.toThrow(
      'OTP verification is required',
    );
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('does not fail the release if the notification email throws', async () => {
    const { service, prisma, mail } = setup();
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'a@b.com',
      auditHoldAt: new Date('2026-01-01'),
      auditHoldReleasedAt: null,
    });
    prisma.user.update.mockResolvedValue({
      id: 'user-1',
      email: 'a@b.com',
      status: 'ACTIVE',
      auditHoldAt: new Date('2026-01-01'),
      auditHoldReleasedAt: new Date(),
    });
    mail.sendAuditHoldReleasedEmail.mockRejectedValue(new Error('resend down'));

    await expect(service.releaseAuditHold('admin-1', 'user-1')).resolves.toMatchObject({
      id: 'user-1',
    });
  });
});

describe('AuthService.login 2FA gating', () => {
  it('mints tokens directly when neither 2FA channel is enabled (fixes the login-OTP email spam)', async () => {
    const { service, prisma, otp } = setup();
    const passwordHash = await bcrypt.hash('password123', 4);
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'a@b.com',
      passwordHash,
      status: 'ACTIVE',
      role: 'TRAINER',
      twoFactorEmailEnabled: false,
      twoFactorSmsEnabled: false,
      referralCode: 'ref-1',
    });

    const result = await service.login('a@b.com', 'password123');

    expect(otp.issueWithTicket).not.toHaveBeenCalled();
    expect(result).toMatchObject({ accessToken: expect.any(String), refreshToken: expect.any(String) });
    expect(prisma.refreshToken.create).toHaveBeenCalled();
  });

  it('issues an email OTP ticket when twoFactorEmailEnabled is on', async () => {
    const { service, prisma, otp } = setup();
    const passwordHash = await bcrypt.hash('password123', 4);
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'a@b.com',
      passwordHash,
      status: 'ACTIVE',
      twoFactorEmailEnabled: true,
      twoFactorSmsEnabled: false,
      phoneVerifiedAt: null,
      phoneNumber: null,
    });

    const result = await service.login('a@b.com', 'password123');

    expect(otp.issueWithTicket).toHaveBeenCalledWith('user-1', 'LOGIN', 'a@b.com', 'EMAIL');
    expect(result).toMatchObject({ otpRequired: true });
  });

  it('prefers SMS over email when both are enabled and the phone is verified', async () => {
    const { service, prisma, otp } = setup();
    const passwordHash = await bcrypt.hash('password123', 4);
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'a@b.com',
      passwordHash,
      status: 'ACTIVE',
      twoFactorEmailEnabled: true,
      twoFactorSmsEnabled: true,
      phoneVerifiedAt: new Date(),
      phoneNumber: '+15551234567',
    });

    await service.login('a@b.com', 'password123');

    expect(otp.issueWithTicket).toHaveBeenCalledWith('user-1', 'LOGIN', '+15551234567', 'SMS');
  });

  it('falls back to email when SMS 2FA is on but the phone was never verified', async () => {
    const { service, prisma, otp } = setup();
    const passwordHash = await bcrypt.hash('password123', 4);
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'a@b.com',
      passwordHash,
      status: 'ACTIVE',
      twoFactorEmailEnabled: false,
      twoFactorSmsEnabled: true,
      phoneVerifiedAt: null,
      phoneNumber: null,
    });

    await service.login('a@b.com', 'password123');

    expect(otp.issueWithTicket).toHaveBeenCalledWith('user-1', 'LOGIN', 'a@b.com', 'EMAIL');
  });
});

describe('AuthService.changePassword', () => {
  it('rejects an incorrect current password without touching the DB', async () => {
    const { service, prisma } = setup();
    const passwordHash = await bcrypt.hash('correct-password', 4);
    prisma.user.findUniqueOrThrow.mockResolvedValue({ id: 'user-1', passwordHash });

    await expect(service.changePassword('user-1', 'wrong-password', 'new-password-123')).rejects.toThrow(
      UnauthorizedException,
    );
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('hashes the new password and revokes every other session, keeping the presented one', async () => {
    const { service, prisma } = setup();
    const passwordHash = await bcrypt.hash('correct-password', 4);
    prisma.user.findUniqueOrThrow.mockResolvedValue({ id: 'user-1', passwordHash });

    await service.changePassword('user-1', 'correct-password', 'new-password-123', 'current-refresh');

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-1' },
        data: expect.objectContaining({ passwordHash: expect.any(String) }),
      }),
    );
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        revokedAt: null,
        tokenHash: { not: hashToken('current-refresh') },
      },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it('revokes all sessions when no current refresh token is presented', async () => {
    const { service, prisma } = setup();
    const passwordHash = await bcrypt.hash('correct-password', 4);
    prisma.user.findUniqueOrThrow.mockResolvedValue({ id: 'user-1', passwordHash });

    await service.changePassword('user-1', 'correct-password', 'new-password-123');

    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });
});

describe('AuthService.updateTwoFactorSettings', () => {
  it('rejects enabling SMS 2FA when the phone is not verified', async () => {
    const { service, prisma } = setup();
    prisma.user.findUniqueOrThrow.mockResolvedValue({ id: 'user-1', phoneVerifiedAt: null });

    await expect(service.updateTwoFactorSettings('user-1', undefined, true)).rejects.toThrow(
      UnprocessableEntityException,
    );
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('enables SMS 2FA when the phone is already verified', async () => {
    const { service, prisma } = setup();
    prisma.user.findUniqueOrThrow.mockResolvedValue({ id: 'user-1', phoneVerifiedAt: new Date() });
    prisma.user.update.mockResolvedValue({
      id: 'user-1',
      email: 'a@b.com',
      role: 'TRAINER',
      status: 'ACTIVE',
      referralCode: 'ref-1',
      twoFactorEmailEnabled: false,
      twoFactorSmsEnabled: true,
    });

    const result = await service.updateTwoFactorSettings('user-1', undefined, true);

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { twoFactorSmsEnabled: true },
    });
    expect(result.twoFactorSmsEnabled).toBe(true);
  });

  it('turning email 2FA on never touches the SMS gate', async () => {
    const { service, prisma } = setup();
    prisma.user.findUniqueOrThrow.mockResolvedValue({ id: 'user-1', phoneVerifiedAt: null });
    prisma.user.update.mockResolvedValue({
      id: 'user-1',
      email: 'a@b.com',
      role: 'TRAINER',
      status: 'ACTIVE',
      referralCode: 'ref-1',
      twoFactorEmailEnabled: true,
      twoFactorSmsEnabled: false,
    });

    await service.updateTwoFactorSettings('user-1', true, undefined);

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { twoFactorEmailEnabled: true },
    });
  });
});

describe('AuthService account closure', () => {
  it('requestAccountCloseOtp issues an OTP to the user\'s own email when no verified phone exists', async () => {
    const { service, prisma, otp } = setup();
    prisma.user.findUniqueOrThrow.mockResolvedValue({
      id: 'user-1',
      email: 'a@b.com',
      phoneNumber: null,
      phoneVerifiedAt: null,
    });

    const result = await service.requestAccountCloseOtp('user-1');

    expect(otp.issueForUser).toHaveBeenCalledWith(
      'user-1',
      'ACCOUNT_CLOSE',
      'a@b.com',
      expect.any(String),
      'EMAIL',
    );
    expect(result).toMatchObject({ otpRequestId: 'otp-request-1' });
  });

  it('requestAccountCloseOtp prefers SMS to a verified phone number', async () => {
    const { service, prisma, otp } = setup();
    prisma.user.findUniqueOrThrow.mockResolvedValue({
      id: 'user-1',
      email: 'a@b.com',
      phoneNumber: '+15551234567',
      phoneVerifiedAt: new Date(),
    });

    await service.requestAccountCloseOtp('user-1');

    expect(otp.issueForUser).toHaveBeenCalledWith(
      'user-1',
      'ACCOUNT_CLOSE',
      '+15551234567',
      expect.any(String),
      'SMS',
    );
  });

  it('closeAccount verifies the OTP, flips status to CLOSED, and revokes every session', async () => {
    const { service, prisma, otp } = setup();
    otp.verify.mockResolvedValue({ id: 'otp-row-1', userId: 'user-1' });

    await service.closeAccount('user-1', 'otp-request-1', '123456');

    expect(otp.verify).toHaveBeenCalledWith(
      expect.objectContaining({
        otpRequestId: 'otp-request-1',
        userId: 'user-1',
        purpose: 'ACCOUNT_CLOSE',
        code: '123456',
      }),
    );
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { status: 'CLOSED' },
    });
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it('closeAccount does not touch the user row when OTP verification fails', async () => {
    const { service, prisma, otp } = setup();
    otp.verify.mockRejectedValue(new UnauthorizedException('Invalid or expired code'));

    await expect(service.closeAccount('user-1', 'otp-request-1', '000000')).rejects.toThrow(
      UnauthorizedException,
    );
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});

describe('AuthService.revokePhoneVerification', () => {
  it('rejects when the account has no verified phone number', async () => {
    const { service, prisma } = setup();
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'a@b.com',
      phoneNumber: null,
      phoneVerifiedAt: null,
    });

    await expect(service.revokePhoneVerification('admin-1', 'user-1')).rejects.toThrow(
      'does not have a verified phone number',
    );
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('clears phoneNumber/phoneVerifiedAt and turns off twoFactorSmsEnabled', async () => {
    const { service, prisma } = setup();
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'a@b.com',
      phoneNumber: '+15551234567',
      phoneVerifiedAt: new Date('2026-01-01'),
      twoFactorSmsEnabled: true,
    });
    prisma.user.update.mockResolvedValue({
      id: 'user-1',
      email: 'a@b.com',
      role: 'TRAINER',
      status: 'ACTIVE',
      referralCode: 'ref-1',
      phoneNumber: null,
      phoneVerifiedAt: null,
      twoFactorSmsEnabled: false,
    });

    const result = await service.revokePhoneVerification('admin-1', 'user-1');

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { phoneNumber: null, phoneVerifiedAt: null, twoFactorSmsEnabled: false },
      include: { dialect: true, dialectVariant: true },
    });
    expect(result.phoneVerified).toBe(false);
    expect(result.twoFactorSmsEnabled).toBe(false);
  });

  it('requires OTP when adminPayoutOtpEnabled is on', async () => {
    const { service, prisma, platformSettings } = setup();
    platformSettings.isAdminPayoutOtpEnabled.mockResolvedValue(true);
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'a@b.com',
      phoneNumber: '+15551234567',
      phoneVerifiedAt: new Date(),
    });

    await expect(service.revokePhoneVerification('admin-1', 'user-1')).rejects.toThrow(
      'OTP verification is required',
    );
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});

describe('AuthService.requestRevokePhoneOtp', () => {
  it("issues an OTP to the admin's own email when the admin has no verified phone", async () => {
    const { service, prisma, otp } = setup();
    prisma.user.findUniqueOrThrow.mockResolvedValue({
      id: 'admin-1',
      email: 'admin@b.com',
      phoneNumber: null,
      phoneVerifiedAt: null,
    });

    const result = await service.requestRevokePhoneOtp('admin-1', 'user-1');

    expect(otp.issueForUser).toHaveBeenCalledWith(
      'admin-1',
      'ADMIN_PAYOUT',
      'admin@b.com',
      expect.any(String),
      'EMAIL',
    );
    expect(result).toMatchObject({ otpRequestId: 'otp-request-1' });
  });

  it("prefers SMS to the admin's own verified phone number over email", async () => {
    const { service, prisma, otp } = setup();
    prisma.user.findUniqueOrThrow.mockResolvedValue({
      id: 'admin-1',
      email: 'admin@b.com',
      phoneNumber: '+15551234567',
      phoneVerifiedAt: new Date(),
    });

    await service.requestRevokePhoneOtp('admin-1', 'user-1');

    expect(otp.issueForUser).toHaveBeenCalledWith(
      'admin-1',
      'ADMIN_PAYOUT',
      '+15551234567',
      expect.any(String),
      'SMS',
    );
  });
});

describe('AuthService.updateProfile gender', () => {
  it('persists gender when provided', async () => {
    const { service, prisma } = setup();
    prisma.user.update.mockResolvedValue({
      id: 'user-1',
      firstName: 'A',
      lastName: 'B',
      gender: 'FEMALE',
      role: 'TRAINER',
      originCountryId: null,
      countryId: null,
      dialectId: null,
      dialect: null,
      dialectVariant: null,
      referralCode: 'ref-1',
    });

    await service.updateProfile('user-1', { gender: 'FEMALE' as never });

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-1' },
        data: expect.objectContaining({ gender: 'FEMALE' }),
      }),
    );
  });

  it('leaves gender untouched when not provided', async () => {
    const { service, prisma } = setup();
    prisma.user.update.mockResolvedValue({
      id: 'user-1',
      firstName: 'A',
      lastName: 'B',
      gender: null,
      role: 'TRAINER',
      originCountryId: null,
      countryId: null,
      dialectId: null,
      dialect: null,
      dialectVariant: null,
      referralCode: 'ref-1',
    });

    await service.updateProfile('user-1', { firstName: 'A' });

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ gender: expect.anything() }),
      }),
    );
  });
});

describe('AuthService.updateProfile subdialect requirement', () => {
  it('rejects setting a dialect without a dialectVariantId -- every dialect has at least a Basic variant seeded', async () => {
    const { service, prisma } = setup();
    prisma.dialect.findUnique.mockResolvedValue({
      id: 'dialect-1',
      countryId: 'country-1',
      active: true,
    });

    await expect(
      service.updateProfile('user-1', {
        countryId: 'country-1',
        dialectId: 'dialect-1',
      }),
    ).rejects.toThrow('Select a subdialect for the given dialect');

    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('rejects a dialectVariantId that does not belong to the dialect being set', async () => {
    const { service, prisma } = setup();
    prisma.dialect.findUnique.mockResolvedValue({
      id: 'dialect-1',
      countryId: 'country-1',
      active: true,
    });
    prisma.dialectVariant.findUnique.mockResolvedValue({
      id: 'variant-1',
      dialectId: 'some-other-dialect',
      active: true,
    });

    await expect(
      service.updateProfile('user-1', {
        countryId: 'country-1',
        dialectId: 'dialect-1',
        dialectVariantId: 'variant-1',
      }),
    ).rejects.toThrow('Select an active sub-dialect for the given dialect');

    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('accepts a dialect + a matching dialectVariantId together', async () => {
    const { service, prisma } = setup();
    prisma.dialect.findUnique.mockResolvedValue({
      id: 'dialect-1',
      countryId: 'country-1',
      active: true,
    });
    prisma.dialectVariant.findUnique.mockResolvedValue({
      id: 'variant-1',
      dialectId: 'dialect-1',
      active: true,
    });
    prisma.user.update.mockResolvedValue({
      id: 'user-1',
      firstName: 'A',
      lastName: 'B',
      gender: null,
      role: 'TRAINER',
      originCountryId: null,
      countryId: 'country-1',
      dialectId: 'dialect-1',
      dialectVariantId: 'variant-1',
      dialect: { id: 'dialect-1', active: true },
      dialectVariant: { id: 'variant-1', active: true },
      referralCode: 'ref-1',
    });

    await service.updateProfile('user-1', {
      countryId: 'country-1',
      dialectId: 'dialect-1',
      dialectVariantId: 'variant-1',
    });

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          countryId: 'country-1',
          dialectId: 'dialect-1',
          dialectVariantId: 'variant-1',
        }),
      }),
    );
  });
});

describe('AuthService.listUsers search', () => {
  function searchClause(prisma: ReturnType<typeof setup>['prisma']) {
    return prisma.user.findMany.mock.calls[0][0].where.OR as Array<Record<string, unknown>>;
  }

  it('matches country of origin by name, so "Zimbabwe" finds that country\'s users', async () => {
    const { service, prisma } = setup();
    prisma.user.findMany.mockResolvedValue([]);

    await service.listUsers({ search: 'Zimbabwe' });

    // Has to be a server-side relation filter: the list response only carries
    // originCountryId and the admin table resolves the display name from a
    // separate countries lookup, so there is no country text on the client.
    expect(searchClause(prisma)).toEqual(
      expect.arrayContaining([
        {
          originCountry: {
            is: {
              OR: [
                { name: { contains: 'Zimbabwe', mode: 'insensitive' } },
                { code: { equals: 'Zimbabwe', mode: 'insensitive' } },
              ],
            },
          },
        },
      ]),
    );
  });

  it('searches originCountry, not the dialect-scoping country', async () => {
    const { service, prisma } = setup();
    prisma.user.findMany.mockResolvedValue([]);

    await service.listUsers({ search: 'Nigeria' });

    const keys = searchClause(prisma).flatMap((clause) => Object.keys(clause));
    // `country` scopes which dialect a trainer works on -- a different
    // question from where they are from, and not what the admin table shows.
    expect(keys).toContain('originCountry');
    expect(keys).not.toContain('country');
  });

  it('matches an ISO code exactly rather than by substring', async () => {
    const { service, prisma } = setup();
    prisma.user.findMany.mockResolvedValue([]);

    await service.listUsers({ search: 'ZW' });

    const countryClause = searchClause(prisma).find((c) => 'originCountry' in c) as {
      originCountry: { is: { OR: Array<Record<string, Record<string, string>>> } };
    };
    const codeClause = countryClause.originCountry.is.OR.find((c) => 'code' in c);
    // `contains` on a 2-letter code would make short queries match wildly --
    // "in" would hit India, Indonesia AND every name containing "in".
    expect(codeClause).toEqual({ code: { equals: 'ZW', mode: 'insensitive' } });
  });

  it('still matches name, email and phone alongside country', async () => {
    const { service, prisma } = setup();
    prisma.user.findMany.mockResolvedValue([]);

    await service.listUsers({ search: 'daisy' });

    const keys = searchClause(prisma).flatMap((clause) => Object.keys(clause));
    expect(keys).toEqual(
      expect.arrayContaining(['email', 'firstName', 'lastName', 'phoneNumber', 'originCountry']),
    );
  });

  it('applies no OR filter when no search term is given', async () => {
    const { service, prisma } = setup();
    prisma.user.findMany.mockResolvedValue([]);

    await service.listUsers({});

    expect(prisma.user.findMany.mock.calls[0][0].where.OR).toBeUndefined();
  });
});

process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'test-secret';

jest.mock('@dialectiva/db', () => ({
  ...jest.requireActual('@dialectiva/db'),
  creditStartupBonus: jest.fn(),
}));
import { creditStartupBonus, Prisma } from '@dialectiva/db';
import { ConflictException, UnauthorizedException, UnprocessableEntityException } from '@nestjs/common';
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
    wallet: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn(), upsert: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    ledgerEntry: { create: jest.fn() },
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
      .mockResolvedValue({ enabled: true, feeTokens: 1, whatsappNumber: '1234567890' }),
    isAdminPayoutOtpEnabled: jest.fn().mockResolvedValue(false),
  };
  const p2p = { adminCancelAllForUser: jest.fn() };
  const storage = { deleteObject: jest.fn() };
  const service = new AuthService(prisma as never, mail as never, otp as never, platformSettings as never, p2p as never, storage as never);
  return { service, prisma, mail, otp, platformSettings, storage };
}

describe('AuthService auth maintenance gate', () => {
  it('register rejects with AuthMaintenanceException while signup is blocked', async () => {
    const { service, prisma } = setup({ enabled: true, message: 'Upgrading' });
    await expect(service.register('a@b.com', 'password123', 'A', 'B')).rejects.toThrow(AuthMaintenanceException);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('login rejects with AuthMaintenanceException while login is blocked', async () => {
    const { service, prisma } = setup({ enabled: true });
    await expect(service.login('a@b.com', 'password123')).rejects.toThrow(AuthMaintenanceException);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
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
  });

  it('grants the startup bonus on a first-time verification when an amount is configured', async () => {
    const { service, prisma, platformSettings } = setup();
    setupToken(prisma);
    platformSettings.getStartupBonusAmount.mockResolvedValue(25);

    await service.verifyEmail('raw-token');

    expect(creditStartupBonus).toHaveBeenCalledWith(prisma, 'user-1', 25, 'signup-verification');
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
  function setupTicket(prisma: ReturnType<typeof setup>['prisma'], otp: ReturnType<typeof setup>['otp']) {
    prisma.otpCode.findUnique.mockResolvedValue({ purpose: 'REGISTRATION' });
    otp.verifyWithoutConsuming.mockResolvedValue({ id: 'otp-1', userId: 'user-1' });
    // Same "count matched" convention as verifyEmail's updateMany guard --
    // default to "1 row matched" (a normal first-time verify).
    prisma.user.updateMany.mockResolvedValue({ count: 1 });
    prisma.user.findUniqueOrThrow.mockResolvedValue({ id: 'user-1', email: 'a@b.com', referredById: null });
  }

  beforeEach(() => {
    (creditStartupBonus as jest.Mock).mockReset().mockResolvedValue(undefined);
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
  function setupToken(prisma: ReturnType<typeof setup>['prisma'], overrides: Partial<{ usedAt: Date | null; expiresAt: Date }> = {}) {
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
      expect.objectContaining({ where: { id: 'user-1' }, data: expect.objectContaining({ passwordHash: expect.any(String) }) }),
    );
    expect(prisma.passwordResetToken.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'token-1' }, data: expect.objectContaining({ usedAt: expect.any(Date) }) }),
    );
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1', revokedAt: null }, data: expect.objectContaining({ revokedAt: expect.any(Date) }) }),
    );
  });

  it('looks the token up by its sha256 hash, not the raw token', async () => {
    const { service, prisma } = setup();
    setupToken(prisma);

    await service.resetPassword('raw-token', 'new-password-123');

    expect(prisma.passwordResetToken.findUnique).toHaveBeenCalledWith({ where: { tokenHash: hashToken('raw-token') } });
  });

  it('rejects an unknown token', async () => {
    const { service, prisma } = setup();
    prisma.passwordResetToken.findUnique.mockResolvedValue(null);

    await expect(service.resetPassword('raw-token', 'new-password-123')).rejects.toThrow(UnauthorizedException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('rejects an already-used token', async () => {
    const { service, prisma } = setup();
    setupToken(prisma, { usedAt: new Date() });

    await expect(service.resetPassword('raw-token', 'new-password-123')).rejects.toThrow(UnauthorizedException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('rejects an expired token', async () => {
    const { service, prisma } = setup();
    setupToken(prisma, { expiresAt: new Date(Date.now() - 1000) });

    await expect(service.resetPassword('raw-token', 'new-password-123')).rejects.toThrow(UnauthorizedException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});

describe('AuthService.requestManualPhoneVerification', () => {
  it('rejects a user whose phone is already verified', async () => {
    const { service, prisma } = setup();
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1', phoneVerifiedAt: new Date() });

    await expect(service.requestManualPhoneVerification('user-1', '+2348012345678')).rejects.toThrow(ConflictException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a second request while one is already pending', async () => {
    const { service, prisma } = setup();
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1', phoneVerifiedAt: null });
    prisma.manualPhoneVerificationRequest.updateMany.mockResolvedValue({ count: 0 });
    prisma.manualPhoneVerificationRequest.findFirst.mockResolvedValue({ id: 'existing-request' });

    await expect(service.requestManualPhoneVerification('user-1', '+2348012345678')).rejects.toThrow(ConflictException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('AuthService.verifyManualPhoneVerificationRequest', () => {
  function pendingRequest(overrides: Partial<{ attempts: number; maxAttempts: number; expiresAt: Date; otpHash: string }> = {}) {
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
      user: { id: 'user-1', email: 'a@b.com', firstName: null, lastName: null, phoneNumber: '+1234567890', phoneVerifiedAt: new Date() },
      verifiedByAdmin: { id: 'admin-1', email: 'admin@b.com', firstName: null, lastName: null },
    });

    const result = await service.verifyManualPhoneVerificationRequest('admin-1', 'request-1', '123456');

    expect(result.status).toBe('VERIFIED');
    expect(prisma.wallet.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1', balance: { gte: request.feeTokenAmount } } }),
    );
    expect(prisma.ledgerEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ walletId: 'wallet-1', type: 'PHONE_VERIFICATION_FEE' }) }),
    );
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'user-1' }, data: expect.objectContaining({ phoneNumber: '+1234567890' }) }),
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

    await expect(service.verifyManualPhoneVerificationRequest('admin-1', 'request-1', '123456')).rejects.toThrow(
      UnprocessableEntityException,
    );

    expect(prisma.ledgerEntry.create).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('rejects a wrong code and increments attempts without changing status', async () => {
    const { service, prisma } = setup();
    prisma.manualPhoneVerificationRequest.updateMany.mockResolvedValue({ count: 0 });
    prisma.manualPhoneVerificationRequest.findUnique.mockResolvedValue(pendingRequest());

    await expect(service.verifyManualPhoneVerificationRequest('admin-1', 'request-1', '000000')).rejects.toThrow(UnauthorizedException);

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
    prisma.manualPhoneVerificationRequest.findUnique.mockResolvedValue(pendingRequest({ attempts: 5, maxAttempts: 5 }));

    await expect(service.verifyManualPhoneVerificationRequest('admin-1', 'request-1', '123456')).rejects.toThrow(UnauthorizedException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('loses the race cleanly when the request was already resolved concurrently (TOCTOU guard)', async () => {
    const { service, prisma } = setup();
    prisma.manualPhoneVerificationRequest.updateMany.mockResolvedValue({ count: 0 }); // claim fails: another call already resolved it
    prisma.manualPhoneVerificationRequest.findUnique.mockResolvedValue(pendingRequest());

    await expect(service.verifyManualPhoneVerificationRequest('admin-1', 'request-1', '123456')).rejects.toThrow(
      UnprocessableEntityException,
    );
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
      user: { id: 'user-1', email: 'a@b.com', firstName: null, lastName: null, phoneNumber: '+1234567890', phoneVerifiedAt: null },
      verifiedByAdmin: { id: 'admin-1', email: 'admin@b.com', firstName: null, lastName: null },
    });

    const result = await service.rejectManualPhoneVerificationRequest('admin-1', 'request-1');

    expect(result.status).toBe('REJECTED');
    expect(prisma.wallet.update).not.toHaveBeenCalled();
    expect(prisma.wallet.updateMany).not.toHaveBeenCalled();
    expect(prisma.ledgerEntry.create).not.toHaveBeenCalled();
  });
});

describe('AuthService.releaseAuditHold', () => {
  it('rejects when the account is not currently on an audit hold', async () => {
    const { service, prisma } = setup();
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'a@b.com', auditHoldAt: null, auditHoldReleasedAt: null });

    await expect(service.releaseAuditHold('admin-1', 'user-1')).rejects.toThrow('not currently on an audit hold');
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('clears the hold, emails the trainer, and never touches status', async () => {
    const { service, prisma, mail } = setup();
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'a@b.com', auditHoldAt: new Date('2026-01-01'), auditHoldReleasedAt: null });
    prisma.user.update.mockResolvedValue({ id: 'user-1', email: 'a@b.com', status: 'ACTIVE', auditHoldAt: new Date('2026-01-01'), auditHoldReleasedAt: new Date() });

    const result = await service.releaseAuditHold('admin-1', 'user-1');

    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'user-1' },
      data: expect.objectContaining({ auditHoldReleasedById: 'admin-1' }),
    }));
    expect(prisma.user.update.mock.calls[0][0].data).not.toHaveProperty('status');
    expect(mail.sendAuditHoldReleasedEmail).toHaveBeenCalledWith('a@b.com');
    expect(result.onAuditHold).toBe(false);
  });

  it('requires OTP when adminPayoutOtpEnabled is on', async () => {
    const { service, prisma, platformSettings } = setup();
    platformSettings.isAdminPayoutOtpEnabled.mockResolvedValue(true);
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'a@b.com', auditHoldAt: new Date(), auditHoldReleasedAt: null });

    await expect(service.releaseAuditHold('admin-1', 'user-1')).rejects.toThrow('OTP verification is required');
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('does not fail the release if the notification email throws', async () => {
    const { service, prisma, mail } = setup();
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'a@b.com', auditHoldAt: new Date('2026-01-01'), auditHoldReleasedAt: null });
    prisma.user.update.mockResolvedValue({ id: 'user-1', email: 'a@b.com', status: 'ACTIVE', auditHoldAt: new Date('2026-01-01'), auditHoldReleasedAt: new Date() });
    mail.sendAuditHoldReleasedEmail.mockRejectedValue(new Error('resend down'));

    await expect(service.releaseAuditHold('admin-1', 'user-1')).resolves.toMatchObject({ id: 'user-1' });
  });
});

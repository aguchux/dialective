process.env.STREAM_JWT_ACCESS_SECRET = process.env.STREAM_JWT_ACCESS_SECRET ?? 'test-stream-secret';

import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { SubscriberOrgRole } from '@dialectiva/db';
import { SubscriberAuthService } from './subscriber-auth.service';
import { hashToken } from '../../auth/token.util';
import { hashOtpCode } from '../../otp/otp.util';

function setup() {
  const prisma = {
    subscriberUser: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    subscriberOrganization: {
      create: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    subscriberMembership: {
      create: jest.fn(),
      findFirst: jest.fn(),
    },
    subscriberOtpCode: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    subscriberRefreshToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    subscriberInvite: {
      deleteMany: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    subscriberOrgSecurityPolicy: {
      findUnique: jest.fn(),
    },
    $transaction: undefined as unknown as jest.Mock,
  };
  prisma.$transaction = jest.fn(async (ops: unknown) => {
    if (typeof ops === 'function') return (ops as (tx: unknown) => unknown)(prisma);
    return Promise.all(ops as Promise<unknown>[]);
  });

  const mail = {
    sendOtpEmail: jest.fn().mockResolvedValue(undefined),
    sendSubscriberInviteEmail: jest.fn().mockResolvedValue(undefined),
  };

  const webhookEvents = { emit: jest.fn().mockResolvedValue(undefined) };
  const orgActivity = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new SubscriberAuthService(prisma as any, mail as any, webhookEvents as any, orgActivity as any);
  return { prisma, mail, webhookEvents, orgActivity, service };
}

describe('SubscriberAuthService', () => {
  describe('register', () => {
    it('rejects when the email is already registered', async () => {
      const { prisma, service } = setup();
      prisma.subscriberUser.findUnique.mockResolvedValue({ id: 'existing' });

      await expect(
        service.register('a@b.com', 'password123', 'A', 'B', 'Acme'),
      ).rejects.toThrow(ConflictException);
    });

    it('creates an organization, an OWNER user, and issues a verification OTP', async () => {
      const { prisma, mail, service } = setup();
      prisma.subscriberUser.findUnique.mockResolvedValue(null);
      prisma.subscriberOrganization.create.mockResolvedValue({ id: 'org-1', name: 'Acme' });
      prisma.subscriberUser.create.mockResolvedValue({
        id: 'user-1',
        email: 'a@b.com',
        firstName: 'A',
        lastName: 'B',
      });
      prisma.subscriberMembership.create.mockResolvedValue({});

      const result = await service.register('a@b.com', 'password123', 'A', 'B', 'Acme');

      expect(prisma.subscriberOrganization.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ name: 'Acme' }) }),
      );
      expect(prisma.subscriberMembership.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ role: SubscriberOrgRole.OWNER }),
        }),
      );
      expect(prisma.subscriberOtpCode.create).toHaveBeenCalled();
      expect(mail.sendOtpEmail).toHaveBeenCalledWith(
        'a@b.com',
        expect.any(String),
        'SUBSCRIBER_EMAIL_VERIFY',
      );
      expect(result).toEqual(
        expect.objectContaining({ otpRequired: true, ticket: expect.any(String) }),
      );
    });
  });

  describe('login', () => {
    it('rejects an unknown email', async () => {
      const { prisma, service } = setup();
      prisma.subscriberUser.findUnique.mockResolvedValue(null);

      await expect(service.login('nope@b.com', 'password123')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects password login for an SSO-only account (null passwordHash)', async () => {
      const { prisma, service } = setup();
      prisma.subscriberUser.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'a@b.com',
        passwordHash: null,
      });

      await expect(service.login('a@b.com', 'anything')).rejects.toThrow(UnauthorizedException);
    });

    it('rejects an incorrect password', async () => {
      const { prisma, service } = setup();
      const bcrypt = require('bcrypt');
      prisma.subscriberUser.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'a@b.com',
        passwordHash: await bcrypt.hash('correct-password', 12),
      });
      prisma.subscriberMembership.findFirst.mockResolvedValue({
        organizationId: 'org-1',
        role: SubscriberOrgRole.ADMIN,
      });
      prisma.subscriberOrgSecurityPolicy.findUnique.mockResolvedValue(null);

      await expect(service.login('a@b.com', 'wrong-password')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects password login when the org requires SSO and the caller is not OWNER', async () => {
      const { prisma, service } = setup();
      const bcrypt = require('bcrypt');
      prisma.subscriberUser.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'a@b.com',
        passwordHash: await bcrypt.hash('correct-password', 12),
      });
      prisma.subscriberMembership.findFirst.mockResolvedValue({
        organizationId: 'org-1',
        role: SubscriberOrgRole.ADMIN,
      });
      prisma.subscriberOrgSecurityPolicy.findUnique.mockResolvedValue({ requireSso: true });

      await expect(service.login('a@b.com', 'correct-password')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('allows password login for OWNER even when the org requires SSO (break-glass fallback)', async () => {
      const { prisma, mail, service } = setup();
      const bcrypt = require('bcrypt');
      prisma.subscriberUser.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'owner@b.com',
        passwordHash: await bcrypt.hash('correct-password', 12),
      });
      prisma.subscriberMembership.findFirst.mockResolvedValue({
        organizationId: 'org-1',
        role: SubscriberOrgRole.OWNER,
      });
      prisma.subscriberOrgSecurityPolicy.findUnique.mockResolvedValue({ requireSso: true });

      const result = await service.login('owner@b.com', 'correct-password');

      expect(result.otpRequired).toBe(true);
      expect(mail.sendOtpEmail).toHaveBeenCalled();
    });

    it('issues a login OTP on correct credentials', async () => {
      const { prisma, mail, service } = setup();
      const bcrypt = require('bcrypt');
      prisma.subscriberUser.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'a@b.com',
        passwordHash: await bcrypt.hash('correct-password', 12),
      });
      prisma.subscriberMembership.findFirst.mockResolvedValue({
        organizationId: 'org-1',
        role: SubscriberOrgRole.ADMIN,
      });
      prisma.subscriberOrgSecurityPolicy.findUnique.mockResolvedValue(null);

      const result = await service.login('a@b.com', 'correct-password');

      expect(result.otpRequired).toBe(true);
      expect(mail.sendOtpEmail).toHaveBeenCalledWith(
        'a@b.com',
        expect.any(String),
        'SUBSCRIBER_LOGIN',
      );
    });
  });

  describe('verifyOtp', () => {
    it('rejects an unknown ticket', async () => {
      const { prisma, service } = setup();
      prisma.subscriberOtpCode.findUnique.mockResolvedValue(null);

      await expect(service.verifyOtp('bad-ticket', '123456')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects an incorrect code and increments attempts', async () => {
      const { prisma, service } = setup();
      prisma.subscriberOtpCode.findUnique.mockResolvedValue({
        id: 'otp-1',
        userId: 'user-1',
        purpose: 'SUBSCRIBER_LOGIN',
        codeHash: hashOtpCode('999999'),
        consumedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        attempts: 0,
        maxAttempts: 5,
      });

      await expect(service.verifyOtp('ticket-1', '111111')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(prisma.subscriberOtpCode.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { attempts: { increment: 1 } } }),
      );
    });

    it('marks the email verified on first SUBSCRIBER_EMAIL_VERIFY success and issues tokens', async () => {
      const { prisma, service } = setup();
      prisma.subscriberOtpCode.findUnique.mockResolvedValue({
        id: 'otp-1',
        userId: 'user-1',
        purpose: 'SUBSCRIBER_EMAIL_VERIFY',
        codeHash: hashOtpCode('123456'),
        consumedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        attempts: 0,
        maxAttempts: 5,
      });
      prisma.subscriberUser.findUniqueOrThrow.mockResolvedValue({
        id: 'user-1',
        email: 'a@b.com',
        firstName: 'A',
        lastName: 'B',
        emailVerifiedAt: null,
      });
      prisma.subscriberMembership.findFirst.mockResolvedValue({
        organizationId: 'org-1',
        role: SubscriberOrgRole.OWNER,
      });

      const result = await service.verifyOtp('ticket-1', '123456');

      expect(prisma.subscriberUser.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { emailVerifiedAt: expect.any(Date) } }),
      );
      expect(result.accessToken).toEqual(expect.any(String));
      expect(result.refreshToken).toEqual(expect.any(String));
      expect(result.organizationId).toBe('org-1');
      expect(result.orgRole).toBe(SubscriberOrgRole.OWNER);
    });
  });

  describe('refresh', () => {
    it('rejects an unknown refresh token', async () => {
      const { prisma, service } = setup();
      prisma.subscriberRefreshToken.findUnique.mockResolvedValue(null);

      await expect(service.refresh('bad-token')).rejects.toThrow(UnauthorizedException);
    });

    it('revokes the whole token family when a revoked token is reused', async () => {
      const { prisma, service } = setup();
      prisma.subscriberRefreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId: 'user-1',
        familyId: 'family-1',
        revokedAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
      });

      await expect(service.refresh('stolen-token')).rejects.toThrow(UnauthorizedException);
      expect(prisma.subscriberRefreshToken.updateMany).toHaveBeenCalledWith({
        where: { familyId: 'family-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('rotates the token and issues a fresh access token on valid presentation', async () => {
      const { prisma, service } = setup();
      prisma.subscriberRefreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId: 'user-1',
        familyId: 'family-1',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      });
      prisma.subscriberUser.findUnique.mockResolvedValue({ id: 'user-1', email: 'a@b.com' });
      prisma.subscriberMembership.findFirst.mockResolvedValue({
        organizationId: 'org-1',
        role: SubscriberOrgRole.ADMIN,
      });

      const result = await service.refresh('valid-token');

      expect(result.accessToken).toEqual(expect.any(String));
      expect(result.refreshToken).toEqual(expect.any(String));
      expect(prisma.subscriberRefreshToken.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'rt-1' },
          data: expect.objectContaining({ revokedAt: expect.any(Date) }),
        }),
      );
    });

    it('uses the org security policy refresh TTL override when set', async () => {
      const { prisma, service } = setup();
      prisma.subscriberRefreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId: 'user-1',
        familyId: 'family-1',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      });
      prisma.subscriberUser.findUnique.mockResolvedValue({ id: 'user-1', email: 'a@b.com' });
      prisma.subscriberMembership.findFirst.mockResolvedValue({
        organizationId: 'org-1',
        role: SubscriberOrgRole.ADMIN,
      });
      prisma.subscriberOrgSecurityPolicy.findUnique.mockResolvedValue({
        refreshTokenTtlMinutes: 60, // 1 hour, far shorter than the 30-day platform default
      });

      const before = Date.now();
      await service.refresh('valid-token');

      const createCall = prisma.subscriberRefreshToken.create.mock.calls[0][0];
      const expiresAt = createCall.data.expiresAt.getTime();
      // Should land ~1 hour out, not ~30 days out.
      expect(expiresAt - before).toBeLessThan(2 * 60 * 60 * 1000);
      expect(expiresAt - before).toBeGreaterThan(30 * 60 * 1000);
    });

    it('falls back to the 30-day platform default when no policy is configured', async () => {
      const { prisma, service } = setup();
      prisma.subscriberRefreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId: 'user-1',
        familyId: 'family-1',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      });
      prisma.subscriberUser.findUnique.mockResolvedValue({ id: 'user-1', email: 'a@b.com' });
      prisma.subscriberMembership.findFirst.mockResolvedValue({
        organizationId: 'org-1',
        role: SubscriberOrgRole.ADMIN,
      });
      prisma.subscriberOrgSecurityPolicy.findUnique.mockResolvedValue(null);

      const before = Date.now();
      await service.refresh('valid-token');

      const createCall = prisma.subscriberRefreshToken.create.mock.calls[0][0];
      const expiresAt = createCall.data.expiresAt.getTime();
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
      expect(expiresAt - before).toBeGreaterThan(thirtyDaysMs - 5000);
      expect(expiresAt - before).toBeLessThan(thirtyDaysMs + 5000);
    });
  });

  describe('inviteMember / acceptInvite', () => {
    it('rejects inviting someone already a member', async () => {
      const { prisma, service } = setup();
      prisma.subscriberMembership.findFirst.mockResolvedValue({ id: 'membership-1' });

      await expect(
        service.inviteMember('org-1', 'inviter-1', 'existing@b.com', SubscriberOrgRole.ADMIN),
      ).rejects.toThrow(ConflictException);
    });

    it('creates an invite and emails it', async () => {
      const { prisma, mail, service } = setup();
      prisma.subscriberMembership.findFirst.mockResolvedValue(null);
      prisma.subscriberOrganization.findUniqueOrThrow.mockResolvedValue({
        id: 'org-1',
        name: 'Acme',
      });

      await service.inviteMember('org-1', 'inviter-1', 'new@b.com', SubscriberOrgRole.VALIDATOR);

      expect(prisma.subscriberInvite.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: 'org-1',
            email: 'new@b.com',
            role: SubscriberOrgRole.VALIDATOR,
          }),
        }),
      );
      expect(mail.sendSubscriberInviteEmail).toHaveBeenCalledWith(
        expect.objectContaining({ inviteeEmail: 'new@b.com', organizationName: 'Acme' }),
      );
    });

    it('rejects accepting an expired or already-accepted invite', async () => {
      const { prisma, service } = setup();
      prisma.subscriberInvite.findUnique.mockResolvedValue({
        id: 'invite-1',
        email: 'new@b.com',
        organizationId: 'org-1',
        role: SubscriberOrgRole.VALIDATOR,
        acceptedAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
      });

      await expect(service.acceptInvite('token', 'password123')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('creates a new user and membership on a valid invite', async () => {
      const { prisma, service } = setup();
      prisma.subscriberInvite.findUnique.mockResolvedValue({
        id: 'invite-1',
        email: 'new@b.com',
        organizationId: 'org-1',
        role: SubscriberOrgRole.VALIDATOR,
        acceptedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      });
      prisma.subscriberUser.findUnique.mockResolvedValue(null);
      prisma.subscriberUser.create.mockResolvedValue({
        id: 'user-2',
        email: 'new@b.com',
        firstName: 'new',
        lastName: '',
      });
      prisma.subscriberMembership.findFirst.mockResolvedValue({
        organizationId: 'org-1',
        role: SubscriberOrgRole.VALIDATOR,
      });

      const result = await service.acceptInvite('token', 'password123');

      expect(prisma.subscriberMembership.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ organizationId: 'org-1', role: SubscriberOrgRole.VALIDATOR }),
        }),
      );
      expect(prisma.subscriberInvite.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { acceptedAt: expect.any(Date) } }),
      );
      expect(result.accessToken).toEqual(expect.any(String));
    });
  });

  describe('inviteMember', () => {
    it('rejects inviting someone already a member of the org', async () => {
      const { prisma, service } = setup();
      prisma.subscriberMembership.findFirst.mockResolvedValue({ id: 'm-1' });

      await expect(
        service.inviteMember('org-1', 'inviter-1', 'a@b.com', SubscriberOrgRole.VALIDATOR),
      ).rejects.toThrow(ConflictException);
    });

    it('sends the invite email and records a MEMBER_INVITED activity event', async () => {
      const { prisma, mail, orgActivity, service } = setup();
      prisma.subscriberMembership.findFirst.mockResolvedValue(null);
      prisma.subscriberOrganization.findUniqueOrThrow.mockResolvedValue({ id: 'org-1', name: 'Acme' });

      await service.inviteMember('org-1', 'inviter-1', 'a@b.com', SubscriberOrgRole.VALIDATOR);

      expect(mail.sendSubscriberInviteEmail).toHaveBeenCalledWith(
        expect.objectContaining({ inviteeEmail: 'a@b.com', organizationName: 'Acme' }),
      );
      expect(orgActivity.record).toHaveBeenCalledWith('org-1', 'MEMBER_INVITED', 'inviter-1', {
        email: 'a@b.com',
        role: SubscriberOrgRole.VALIDATOR,
      });
    });
  });
});

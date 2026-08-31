import { ConflictException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { ActivityEventType, OtpPurpose, SubscriberOrgRole, SubscriberUser, WebhookEventType } from '@dialectiva/db';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../../mail/mail.service';
import { generateOpaqueToken, hashToken } from '../../auth/token.util';
import { generateOtpCode, hashOtpCode } from '../../otp/otp.util';
import { signSubscriberAccessToken } from './subscriber-jwt.util';
import { WebhookEventService } from '../webhooks/webhook-event.service';
import { OrgActivityService } from '../org-activity/org-activity.service';

const BCRYPT_ROUNDS = 12;
const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_TTL_SECONDS = OTP_TTL_MS / 1000;
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface SubscriberPendingOtp {
  otpRequired: true;
  ticket: string;
  expiresInSeconds: number;
}

export interface SubscriberAuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface SubscriberAuthResult extends SubscriberAuthTokens {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  };
  organizationId: string;
  orgRole: SubscriberOrgRole;
}

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return `${base || 'org'}-${randomUUID().slice(0, 8)}`;
}

/**
 * Fully separate from AuthService (trainer-facing) -- own users table
 * (SubscriberUser), own OTP table (SubscriberOtpCode, since OtpCode.userId
 * is a hard FK to the trainer User table), own refresh-token table, own JWT
 * secret. Shape (bcrypt cost 12, OTP-ticket 2FA, refresh-token rotation with
 * family-wide revocation on reuse) deliberately mirrors AuthService's proven
 * conventions -- see auth/auth.service.ts.
 */
@Injectable()
export class SubscriberAuthService {
  private readonly logger = new Logger(SubscriberAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly webhookEvents: WebhookEventService,
    private readonly orgActivity: OrgActivityService,
  ) {}

  /**
   * Creates the organization, the first user (as OWNER), and issues an
   * email-verification OTP in one call -- Phase 1 has no separate
   * "create org" step, registration always creates a brand-new organization.
   * Joining an existing org happens only via invite (see acceptInvite).
   */
  async register(
    email: string,
    password: string,
    firstName: string,
    lastName: string,
    organizationName: string,
  ): Promise<SubscriberPendingOtp> {
    const existing = await this.prisma.subscriberUser.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const { user, organizationId } = await this.prisma.$transaction(async (tx) => {
      const org = await tx.subscriberOrganization.create({
        data: { name: organizationName, slug: slugify(organizationName) },
      });
      const createdUser = await tx.subscriberUser.create({
        data: { email, passwordHash, firstName, lastName },
      });
      await tx.subscriberMembership.create({
        data: {
          userId: createdUser.id,
          organizationId: org.id,
          role: SubscriberOrgRole.OWNER,
          acceptedAt: new Date(),
        },
      });
      return { user: createdUser, organizationId: org.id };
    });

    void this.webhookEvents.emit(organizationId, WebhookEventType.SUBSCRIBER_CREATED, {
      organization_id: organizationId,
      user_id: user.id,
      email: user.email,
    });

    return this.issueOtp(user, OtpPurpose.SUBSCRIBER_EMAIL_VERIFY);
  }

  async login(email: string, password: string): Promise<SubscriberPendingOtp> {
    const user = await this.prisma.subscriberUser.findUnique({ where: { email } });
    if (!user || !user.passwordHash) {
      // Same generic message whether the account doesn't exist or is an
      // SSO-only (passwordHash: null) account -- avoids leaking account type.
      throw new UnauthorizedException('Invalid email or password');
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return this.issueOtp(user, OtpPurpose.SUBSCRIBER_LOGIN);
  }

  async verifyOtp(ticket: string, code: string): Promise<SubscriberAuthResult> {
    const row = await this.prisma.subscriberOtpCode.findUnique({
      where: { ticketHash: hashToken(ticket) },
    });
    const invalid = () => new UnauthorizedException('Invalid or expired code');
    if (!row) throw invalid();
    if (row.consumedAt || row.expiresAt < new Date()) throw invalid();
    if (row.attempts >= row.maxAttempts) throw invalid();
    if (hashOtpCode(code) !== row.codeHash) {
      await this.prisma.subscriberOtpCode.update({
        where: { id: row.id },
        data: { attempts: { increment: 1 } },
      });
      throw invalid();
    }

    const isFirstVerification =
      row.purpose === OtpPurpose.SUBSCRIBER_EMAIL_VERIFY &&
      (await this.prisma.subscriberUser.findUniqueOrThrow({ where: { id: row.userId } }))
        .emailVerifiedAt === null;

    await this.prisma.$transaction([
      this.prisma.subscriberOtpCode.update({
        where: { id: row.id },
        data: { consumedAt: new Date() },
      }),
      ...(isFirstVerification
        ? [
            this.prisma.subscriberUser.update({
              where: { id: row.userId },
              data: { emailVerifiedAt: new Date() },
            }),
          ]
        : []),
    ]);

    const user = await this.prisma.subscriberUser.findUniqueOrThrow({ where: { id: row.userId } });
    return this.issueAuthResult(user);
  }

  async resendOtp(ticket: string): Promise<void> {
    const row = await this.prisma.subscriberOtpCode.findUnique({
      where: { ticketHash: hashToken(ticket) },
    });
    if (!row || row.consumedAt || row.expiresAt < new Date()) {
      throw new UnauthorizedException('This code request is no longer valid');
    }
    const user = await this.prisma.subscriberUser.findUniqueOrThrow({ where: { id: row.userId } });
    const { code, hash: codeHash } = generateOtpCode();
    await this.prisma.subscriberOtpCode.update({
      where: { id: row.id },
      data: { codeHash, expiresAt: new Date(Date.now() + OTP_TTL_MS), attempts: 0 },
    });
    await this.mail.sendOtpEmail(user.email, code, row.purpose);
  }

  /**
   * Rotation-on-use with family-wide revocation on reuse -- identical
   * mechanics to AuthService.refresh (auth/auth.service.ts:530-583).
   */
  async refresh(presentedToken: string): Promise<SubscriberAuthTokens> {
    const hash = hashToken(presentedToken);
    const record = await this.prisma.subscriberRefreshToken.findUnique({
      where: { tokenHash: hash },
    });

    if (!record) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (record.revokedAt) {
      this.logger.warn(
        `Subscriber refresh token reuse detected for family=${record.familyId}; revoking family`,
      );
      await this.prisma.subscriberRefreshToken.updateMany({
        where: { familyId: record.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Refresh token has been revoked');
    }

    if (record.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    const user = await this.prisma.subscriberUser.findUnique({ where: { id: record.userId } });
    if (!user) {
      throw new UnauthorizedException('User no longer exists');
    }
    const membership = await this.firstMembership(user.id);

    const { token: nextToken, hash: nextHash } = generateOpaqueToken();

    await this.prisma.$transaction([
      this.prisma.subscriberRefreshToken.update({
        where: { id: record.id },
        data: { revokedAt: new Date(), replacedBy: nextHash },
      }),
      this.prisma.subscriberRefreshToken.create({
        data: {
          userId: user.id,
          tokenHash: nextHash,
          familyId: record.familyId,
          expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
        },
      }),
    ]);

    return {
      accessToken: signSubscriberAccessToken({
        sub: user.id,
        email: user.email,
        organizationId: membership.organizationId,
        orgRole: membership.role,
      }),
      refreshToken: nextToken,
    };
  }

  async logout(presentedToken: string): Promise<void> {
    const hash = hashToken(presentedToken);
    const record = await this.prisma.subscriberRefreshToken.findUnique({
      where: { tokenHash: hash },
    });
    if (!record || record.revokedAt) {
      return;
    }
    await this.prisma.subscriberRefreshToken.updateMany({
      where: { familyId: record.familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Only OWNER|ADMIN may invite (enforced by the controller's
   * @SubscriberRoles guard). Re-inviting the same still-pending email
   * replaces the earlier invite's token rather than creating a duplicate.
   */
  async inviteMember(
    organizationId: string,
    invitedByUserId: string,
    email: string,
    role: SubscriberOrgRole,
  ): Promise<void> {
    const existingMember = await this.prisma.subscriberMembership.findFirst({
      where: { organizationId, user: { email } },
    });
    if (existingMember) {
      throw new ConflictException('This person is already a member of the organization');
    }

    const org = await this.prisma.subscriberOrganization.findUniqueOrThrow({
      where: { id: organizationId },
    });

    const { token, hash } = generateOpaqueToken();
    await this.prisma.subscriberInvite.deleteMany({
      where: { organizationId, email, acceptedAt: null },
    });
    await this.prisma.subscriberInvite.create({
      data: {
        organizationId,
        email,
        role,
        tokenHash: hash,
        invitedByUserId,
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      },
    });

    await this.mail.sendSubscriberInviteEmail({
      inviteeEmail: email,
      organizationName: org.name,
      token,
    });

    void this.orgActivity.record(organizationId, ActivityEventType.MEMBER_INVITED, invitedByUserId, {
      email,
      role,
    });
  }

  /**
   * Admin-approval path for a DataAccessLead (services/api/src/leads):
   * stands up a brand-new SubscriberOrganization + Subscription (on the
   * chosen plan) and issues an owner-role SubscriberInvite, in one
   * transaction -- same shape as register()'s org-creation, but issuing an
   * invite instead of a password (the lead never set one). Reuses
   * acceptInvite() unchanged: it already creates the SubscriberUser/
   * SubscriberMembership generically regardless of whether the org is new.
   */
  async provisionOrganizationFromLead(params: {
    organizationName: string;
    planId: string;
    inviteeEmail: string;
    firstName: string;
    lastName: string;
    invitedByUserId: string;
  }): Promise<{ organizationId: string }> {
    const existingMember = await this.prisma.subscriberMembership.findFirst({
      where: { user: { email: params.inviteeEmail } },
    });
    if (existingMember) {
      throw new ConflictException('This person is already a member of a Voice Stream organization');
    }

    const { token, hash } = generateOpaqueToken();

    const organizationId = await this.prisma.$transaction(async (tx) => {
      const org = await tx.subscriberOrganization.create({
        data: { name: params.organizationName, slug: slugify(params.organizationName) },
      });
      await tx.subscription.create({
        data: { organizationId: org.id, planId: params.planId },
      });
      await tx.subscriberInvite.create({
        data: {
          organizationId: org.id,
          email: params.inviteeEmail,
          firstName: params.firstName,
          lastName: params.lastName,
          role: SubscriberOrgRole.OWNER,
          tokenHash: hash,
          invitedByUserId: params.invitedByUserId,
          expiresAt: new Date(Date.now() + INVITE_TTL_MS),
        },
      });
      return org.id;
    });

    await this.mail.sendSubscriberInviteEmail({
      inviteeEmail: params.inviteeEmail,
      organizationName: params.organizationName,
      token,
    });

    void this.orgActivity.record(organizationId, ActivityEventType.MEMBER_INVITED, params.invitedByUserId, {
      email: params.inviteeEmail,
      role: SubscriberOrgRole.OWNER,
    });

    return { organizationId };
  }

  async acceptInvite(token: string, password: string): Promise<SubscriberAuthResult> {
    const invite = await this.prisma.subscriberInvite.findUnique({
      where: { tokenHash: hashToken(token) },
    });
    const invalid = () => new UnauthorizedException('This invite is invalid or has expired');
    if (!invite) throw invalid();
    if (invite.acceptedAt || invite.expiresAt < new Date()) throw invalid();

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const user = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.subscriberUser.findUnique({ where: { email: invite.email } });
      const invitedUser =
        existing ??
        (await tx.subscriberUser.create({
          data: {
            email: invite.email,
            passwordHash,
            firstName: invite.firstName ?? invite.email.split('@')[0],
            lastName: invite.lastName ?? '',
            emailVerifiedAt: new Date(), // the invite email itself is the proof of ownership
          },
        }));

      await tx.subscriberMembership.create({
        data: {
          userId: invitedUser.id,
          organizationId: invite.organizationId,
          role: invite.role,
          acceptedAt: new Date(),
        },
      });
      await tx.subscriberInvite.update({
        where: { id: invite.id },
        data: { acceptedAt: new Date() },
      });
      return invitedUser;
    });

    return this.issueAuthResult(user);
  }

  private async issueOtp(
    user: SubscriberUser,
    purpose: typeof OtpPurpose.SUBSCRIBER_EMAIL_VERIFY | typeof OtpPurpose.SUBSCRIBER_LOGIN,
  ): Promise<SubscriberPendingOtp> {
    const { code, hash: codeHash } = generateOtpCode();
    const { token: ticket, hash: ticketHash } = generateOpaqueToken();

    await this.prisma.subscriberOtpCode.create({
      data: {
        userId: user.id,
        purpose,
        codeHash,
        ticketHash,
        expiresAt: new Date(Date.now() + OTP_TTL_MS),
      },
    });
    await this.mail.sendOtpEmail(user.email, code, purpose);

    return { otpRequired: true, ticket, expiresInSeconds: OTP_TTL_SECONDS };
  }

  private async firstMembership(userId: string) {
    const membership = await this.prisma.subscriberMembership.findFirst({
      where: { userId, acceptedAt: { not: null } },
      orderBy: { invitedAt: 'asc' },
    });
    if (!membership) {
      throw new UnauthorizedException('No organization membership found for this account');
    }
    return membership;
  }

  /** Public so SsoService can issue tokens for a SubscriberUser resolved from a validated SAML assertion, reusing this logic instead of duplicating it. */
  async issueAuthResult(user: SubscriberUser): Promise<SubscriberAuthResult> {
    const membership = await this.firstMembership(user.id);
    const { token: refreshToken, hash } = generateOpaqueToken();
    const familyId = randomUUID();

    await this.prisma.subscriberRefreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hash,
        familyId,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      },
    });

    return {
      accessToken: signSubscriberAccessToken({
        sub: user.id,
        email: user.email,
        organizationId: membership.organizationId,
        orgRole: membership.role,
      }),
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      },
      organizationId: membership.organizationId,
      orgRole: membership.role,
    };
  }
}

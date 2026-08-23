import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { randomBytes, randomUUID } from 'crypto';
import {
  AuthProvider,
  creditStartupBonus,
  LedgerEntryType,
  ManualPhoneVerificationStatus,
  OtpPurpose,
  Prisma,
  ReferralInviteStatus,
  Role,
  User,
  UserStatus,
  WithdrawalStatus,
} from '@dialectiva/db';
import { isValidPhoneNumber } from 'libphonenumber-js';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { OtpService } from '../otp/otp.service';
import { PlatformSettingsService } from '../settings/platform-settings.service';
import { P2PService } from '../p2p/p2p.service';
import { StorageService } from '../storage/storage.service';
import { createSmslive247Otp, verifySmslive247Otp } from '../sms/smslive247-native-otp';
import { generateOpaqueToken, hashToken } from './token.util';
import { AuthMaintenanceException } from './auth-maintenance.exception';
import { signAccessToken } from './jwt.util';
import { phoneVerificationContextHash } from './phone-otp-context.util';
import { adminActionContextHash } from '../wallet/otp-context.util';
import { generateOtpCode, hashOtpCode } from '../otp/otp.util';
import { isOnAuditHold } from '../common/audit-hold.util';

const SMSLIVE247_NATIVE_OTP_REQUEST_ID = 'smslive247-native';

const BCRYPT_ROUNDS = 12;
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // 1 hour
const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAGIC_LINK_TTL_MS = 15 * 60 * 1000; // 15 minutes
const MANUAL_PHONE_VERIFICATION_TTL_MS = 30 * 60 * 1000; // 30 minutes

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResult extends AuthTokens {
  user: PublicUser;
}

export interface PendingOtp {
  otpRequired: true;
  ticket: string;
  expiresInSeconds: number;
}

export interface PublicUser {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  role: Role;
  status: UserStatus;
  emailVerified: boolean;
  phoneNumber: string | null;
  phoneVerified: boolean;
  kycStatus: string;
  kycVerifiedAt: string | null;
  originCountryId: string | null;
  countryId: string | null;
  dialectId: string | null;
  dialectTag: string | null;
  dialectVariantId: string | null;
  dialectVariantTag: string | null;
  onboardingComplete: boolean;
  referralCode: string;
  emailNotificationsEnabled: boolean;
  smsNotificationsEnabled: boolean;
  marketingNotificationsEnabled: boolean;
  blogNewsNotificationsEnabled: boolean;
  courseNotificationsEnabled: boolean;
  walletBalance?: string;
  submissionsCount?: number;
  wordRecordingsCount?: number;
  auditHoldAt: string | null;
  auditHoldReleasedAt: string | null;
  onAuditHold: boolean;
}

type UserWithDialect = User & {
  dialect?: { tag: string } | null;
  dialectVariant?: { id: string; tag: string } | null;
  wallet?: { balance: Prisma.Decimal } | null;
  _count?: { submissions: number; wordRecordings: number };
};

function toPublicUser(user: UserWithDialect): PublicUser {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    role: user.role,
    status: user.status,
    emailVerified: user.emailVerified !== null,
    phoneNumber: user.phoneNumber,
    phoneVerified: user.phoneVerifiedAt !== null,
    kycStatus: user.kycStatus,
    kycVerifiedAt: user.kycVerifiedAt?.toISOString() ?? null,
    originCountryId: user.originCountryId,
    countryId: user.countryId,
    dialectId: user.dialectId,
    dialectTag: user.dialect?.tag ?? null,
    dialectVariantId: user.dialectVariant?.id ?? null,
    dialectVariantTag: user.dialectVariant?.tag ?? null,
    onboardingComplete:
      user.role !== Role.TRAINER ||
      (user.originCountryId !== null &&
        user.countryId !== null &&
        user.dialectId !== null &&
        !!user.firstName &&
        !!user.lastName),
    referralCode: user.referralCode,
    emailNotificationsEnabled: user.emailNotificationsEnabled,
    smsNotificationsEnabled: user.smsNotificationsEnabled,
    marketingNotificationsEnabled: user.marketingNotificationsEnabled,
    blogNewsNotificationsEnabled: user.blogNewsNotificationsEnabled,
    courseNotificationsEnabled: user.courseNotificationsEnabled,
    ...(user.wallet ? { walletBalance: user.wallet.balance.toString() } : {}),
    ...(user._count
      ? {
          submissionsCount: user._count.submissions,
          wordRecordingsCount: user._count.wordRecordings,
        }
      : {}),
    auditHoldAt: user.auditHoldAt?.toISOString() ?? null,
    auditHoldReleasedAt: user.auditHoldReleasedAt?.toISOString() ?? null,
    onAuditHold: isOnAuditHold(user),
  };
}

// Short, URL-safe, not guessable-in-sequence -- good enough for a referral
// link slug (not a security token, just needs to avoid collisions and look
// clean in a URL). Collision odds at this length are negligible for this
// user base; the DB unique constraint is the actual backstop.
function generateReferralCode(): string {
  return randomBytes(6).toString('base64url');
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly otp: OtpService,
    private readonly platformSettings: PlatformSettingsService,
    private readonly p2p: P2PService,
    private readonly storage: StorageService,
  ) {}

  /**
   * Gate for login (register/login use scope="login") and signup
   * (register/requestMagicLink use scope="signup" -- magic-link request
   * creates the account on first use, so it's a signup path). Independent
   * of authMaintenanceBlockSessions, which JwtAuthGuard enforces separately
   * for already-authenticated requests. Throws AuthMaintenanceException,
   * whose response body carries the countdown target so the frontend can
   * render it without a second round-trip.
   */
  private async assertNotInAuthMaintenance(scope: 'login' | 'signup'): Promise<void> {
    const status = await this.platformSettings.getAuthMaintenanceStatus();
    const blocked = scope === 'login' ? status.blockLogin : status.blockSignup;
    if (status.enabled && blocked) {
      throw new AuthMaintenanceException(status.until!, status.message);
    }
  }

  // --- Registration / credentials login ---------------------------------

  /**
   * Creates the account, then requires an emailed OTP before it's usable --
   * this is the account's proof the email is reachable, replacing the old
   * passive verify-link-as-the-only-gate model (tokens no longer issued
   * synchronously here; see verifyOtp). issueEmailVerification (the
   * link-based flow) is still called too, kept only as a fallback the user
   * can fall back on later (e.g. a "resend verification" action) if they
   * abandon the OTP step mid-registration -- it is no longer the primary
   * gate.
   */
  async register(
    email: string,
    password: string,
    firstName: string,
    lastName: string,
    referralCode?: string,
  ): Promise<PendingOtp> {
    await this.assertNotInAuthMaintenance('signup');
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const referredById = await this.resolveReferrerId(referralCode, email);

    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        firstName,
        lastName,
        referralCode: generateReferralCode(),
        referredById,
      },
    });

    await this.reconcileReferralInvites(email, referredById, user.id);
    await this.issueEmailVerification(user);

    const { ticket, expiresInSeconds } = await this.otp.issueWithTicket(
      user.id,
      OtpPurpose.REGISTRATION,
      user.email,
    );
    return { otpRequired: true, ticket, expiresInSeconds };
  }

  /**
   * Resolves every outstanding ReferralInvite row for this email (there can
   * be more than one -- multiple people are allowed to invite the same
   * email, see schema.prisma's ReferralInvite doc comment): the row from
   * the inviter this user actually registered under (if any) is marked
   * JOINED so it stops showing as a pending invite; every other inviter's
   * row for this email is deleted outright, since that invite is no longer
   * actionable once the person has registered elsewhere (or with no
   * referral at all).
   */
  private async reconcileReferralInvites(
    email: string,
    referredById: string | undefined,
    newUserId: string,
  ): Promise<void> {
    const matchingInvites = await this.prisma.referralInvite.findMany({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true, inviterId: true },
    });
    if (matchingInvites.length === 0) {
      return;
    }

    await Promise.all(
      matchingInvites.map((invite) =>
        invite.inviterId === referredById
          ? this.prisma.referralInvite.update({
              where: { id: invite.id },
              data: { status: ReferralInviteStatus.JOINED, joinedUserId: newUserId },
            })
          : this.prisma.referralInvite.delete({ where: { id: invite.id } }),
      ),
    );
  }

  /**
   * A typo'd/stale referral code shouldn't block signup -- registration
   * proceeds either way, just without attribution if the code doesn't
   * resolve. Public email domains are common among trainers, so attribution
   * must not be rejected only because the inviter and invitee both use Gmail
   * or another shared provider.
   */
  private async resolveReferrerId(
    referralCode: string | undefined,
    newUserEmail: string,
  ): Promise<string | undefined> {
    if (!referralCode) {
      return undefined;
    }
    const referrer = await this.prisma.user.findUnique({ where: { referralCode } });
    if (!referrer) {
      return undefined;
    }
    if (referrer.email.toLowerCase() === newUserEmail.toLowerCase()) {
      return undefined;
    }
    return referrer.id;
  }

  /**
   * 2FA: password check only unlocks an OTP step, never tokens directly.
   * The ticket returned here is minted (via OtpService.issueWithTicket)
   * only after bcrypt.compare succeeds and the account is active -- it is
   * never derived from client-supplied data, so a guessed/replayed ticket
   * without the emailed code is useless, and a guessed code without a
   * ticket bound to one still-pending OtpCode row is equally useless. See
   * verifyOtp for the exchange step.
   */
  async login(email: string, password: string): Promise<PendingOtp> {
    await this.assertNotInAuthMaintenance('login');
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user?.passwordHash) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    this.assertActive(user);

    const { ticket, expiresInSeconds } = await this.otp.issueWithTicket(
      user.id,
      OtpPurpose.LOGIN,
      user.email,
    );
    return { otpRequired: true, ticket, expiresInSeconds };
  }

  /**
   * Shared exchange for both registration and login OTP -- a ticket is
   * unique to exactly one OtpCode row, whose purpose says which flow is
   * pending, so one method covers both rather than two near-identical ones.
   * Registration additionally marks emailVerified (the OTP round trip
   * itself is the proof of ownership); the separate link-based
   * issueEmailVerification token isn't touched here, it stays valid
   * independently as a fallback.
   */
  async verifyOtp(ticket: string, code: string): Promise<AuthResult> {
    const purpose = await this.peekTicketPurpose(ticket);

    if (purpose === OtpPurpose.REGISTRATION) {
      const row = await this.otp.verifyWithoutConsuming({ ticket, purpose, code });
      // updateMany's where clause (emailVerified: null) makes "was this the
      // first verification" an atomic read of count, not a separate
      // read-then-write -- same race guard as verifyEmail, since both flows
      // can mark emailVerified and only the first one should grant the
      // startup bonus.
      const [, { count }] = await this.prisma.$transaction([
        this.prisma.otpCode.update({ where: { id: row.id }, data: { consumedAt: new Date() } }),
        this.prisma.user.updateMany({
          where: { id: row.userId, emailVerified: null },
          data: { emailVerified: new Date() },
        }),
      ]);
      const user = await this.prisma.user.findUniqueOrThrow({ where: { id: row.userId } });
      const isFirstVerification = count > 0;

      if (isFirstVerification) {
        await this.grantStartupBonus(row.userId);
      }

      if (user.referredById) {
        const inviter = await this.prisma.user.findUnique({
          where: { id: user.referredById },
          select: { email: true },
        });
        if (inviter?.email) {
          const inviteeName =
            [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || user.email;
          void this.mail
            .sendReferralJoinNotification({
              inviterEmail: inviter.email,
              inviteeEmail: user.email,
              inviteeName,
            })
            .catch((err) =>
              this.logger.warn(
                `Failed to send referral-join notification to inviter ${inviter.email}: ${err instanceof Error ? err.message : String(err)}`,
              ),
            );
        }
      }

      return this.issueAuthResult(user);
    }

    const row = await this.otp.verify({ ticket, purpose: OtpPurpose.LOGIN, code });
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: row.userId } });
    return this.issueAuthResult(user);
  }

  /**
   * Reads only which purpose a ticket belongs to, without validating
   * expiry/attempts/code -- verifyOtp needs to know which branch to run
   * before it can run the real validation; defaults to LOGIN when the
   * ticket doesn't resolve at all, so the real validation (which does throw
   * a proper UnauthorizedException) is what surfaces the "invalid" error,
   * not this lookup.
   */
  private async peekTicketPurpose(ticket: string): Promise<OtpPurpose> {
    const row = await this.prisma.otpCode.findUnique({ where: { ticketHash: hashToken(ticket) } });
    return row?.purpose ?? OtpPurpose.LOGIN;
  }

  async resendOtp(ticket: string): Promise<void> {
    await this.otp.resend(ticket, true);
  }

  /**
   * Suspended/blocked accounts can't log in, refresh, or consume a magic
   * link -- their existing access token (short-lived, no per-request DB
   * check, see JwtAuthGuard) still works for its remaining ~15min, an
   * accepted tradeoff for not adding a DB hit to every authenticated
   * request. suspendOrBlockUser revokes all refresh tokens on disable so
   * re-auth is blocked immediately even if the access token hasn't expired.
   */
  private assertActive(user: User): void {
    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException(
        'This account has been ' + (user.status === UserStatus.BLOCKED ? 'blocked' : 'suspended'),
      );
    }
  }

  // --- Magic-link, persisted after NextAuth verifies the identity ---

  async requestMagicLink(email: string): Promise<void> {
    await this.assertNotInAuthMaintenance('signup');
    const { token, hash } = generateOpaqueToken();
    // Magic-link tokens reuse the email-verification token table's shape
    // but are issued/consumed via their own endpoints; a user need not
    // exist yet -- first successful consume creates the account.
    const user = await this.prisma.user.upsert({
      where: { email },
      update: {},
      create: { email, referralCode: generateReferralCode() },
    });

    await this.prisma.emailVerificationToken.create({
      data: {
        userId: user.id,
        tokenHash: hash,
        expiresAt: new Date(Date.now() + MAGIC_LINK_TTL_MS),
      },
    });

    await this.mail.sendMagicLinkEmail(email, token);
  }

  async consumeMagicLink(token: string): Promise<AuthResult> {
    const hash = hashToken(token);
    const record = await this.prisma.emailVerificationToken.findUnique({
      where: { tokenHash: hash },
    });
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired magic link');
    }

    const [{ count }] = await this.prisma.$transaction([
      this.prisma.user.updateMany({
        where: { id: record.userId, emailVerified: null },
        data: { emailVerified: new Date() },
      }),
      this.prisma.emailVerificationToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
    ]);
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: record.userId } });

    this.assertActive(user);
    if (count > 0) {
      await this.grantStartupBonus(record.userId);
    }

    let account = await this.prisma.linkedAccount.findUnique({
      where: {
        provider_providerAccountId: { provider: AuthProvider.EMAIL, providerAccountId: user.email },
      },
    });
    if (!account) {
      account = await this.prisma.linkedAccount.create({
        data: { userId: user.id, provider: AuthProvider.EMAIL, providerAccountId: user.email },
      });
    }

    return this.issueAuthResult(user);
  }

  private async grantStartupBonus(userId: string): Promise<void> {
    const bonusAmount = await this.platformSettings.getStartupBonusAmount();
    if (bonusAmount > 0) {
      await creditStartupBonus(this.prisma, userId, bonusAmount, 'signup-verification');
    }
  }

  // --- Refresh / logout ---------------------------------------------------

  /**
   * Rotation-on-use: every refresh call issues a new refresh token and
   * revokes the one presented, chained via familyId. If a revoked token is
   * presented again (a stolen/replayed token), the whole family is revoked
   * -- this is the standard mitigation for refresh-token theft.
   */
  async refresh(presentedToken: string): Promise<AuthTokens> {
    const hash = hashToken(presentedToken);
    const record = await this.prisma.refreshToken.findUnique({ where: { tokenHash: hash } });

    if (!record) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (record.revokedAt) {
      this.logger.warn(
        `Refresh token reuse detected for family=${record.familyId}; revoking family`,
      );
      await this.prisma.refreshToken.updateMany({
        where: { familyId: record.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Refresh token has been revoked');
    }

    if (record.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    const user = await this.prisma.user.findUnique({ where: { id: record.userId } });
    if (!user) {
      throw new UnauthorizedException('User no longer exists');
    }
    this.assertActive(user);

    const { token: nextToken, hash: nextHash } = generateOpaqueToken();

    await this.prisma.$transaction([
      this.prisma.refreshToken.update({
        where: { id: record.id },
        data: { revokedAt: new Date(), replacedBy: nextHash },
      }),
      this.prisma.refreshToken.create({
        data: {
          userId: user.id,
          tokenHash: nextHash,
          familyId: record.familyId,
          expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
        },
      }),
    ]);

    return {
      accessToken: signAccessToken({ sub: user.id, email: user.email, role: user.role }),
      refreshToken: nextToken,
    };
  }

  async logout(presentedToken: string): Promise<void> {
    const hash = hashToken(presentedToken);
    const record = await this.prisma.refreshToken.findUnique({ where: { tokenHash: hash } });
    if (!record || record.revokedAt) {
      return; // already logged out; logout is idempotent
    }
    await this.prisma.refreshToken.updateMany({
      where: { familyId: record.familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  // --- Password reset -----------------------------------------------------

  async requestPasswordReset(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      // Don't reveal whether the email exists.
      return;
    }

    const { token, hash } = generateOpaqueToken();
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hash,
        expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
      },
    });

    await this.mail.sendPasswordResetEmail(email, token);
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const hash = hashToken(token);
    const record = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash: hash } });
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired reset token');
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
      this.prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      // Resetting the password invalidates all existing sessions.
      this.prisma.refreshToken.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  // --- Email verification --------------------------------------------------

  private async issueEmailVerification(user: User): Promise<void> {
    const { token, hash } = generateOpaqueToken();
    await this.prisma.emailVerificationToken.create({
      data: {
        userId: user.id,
        tokenHash: hash,
        expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS),
      },
    });
    await this.mail.sendEmailVerificationEmail(user.email, token);
  }

  async verifyEmail(token: string): Promise<void> {
    const hash = hashToken(token);
    const record = await this.prisma.emailVerificationToken.findUnique({
      where: { tokenHash: hash },
    });
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired verification token');
    }

    // updateMany's where clause (emailVerified: null) makes "was this the
    // first verification" an atomic read of count, not a separate
    // read-then-write -- closes the race where two still-valid tokens for
    // the same account are verified concurrently and would otherwise both
    // see emailVerified as null and double-grant the startup bonus.
    const [{ count }] = await this.prisma.$transaction([
      this.prisma.user.updateMany({
        where: { id: record.userId, emailVerified: null },
        data: { emailVerified: new Date() },
      }),
      this.prisma.emailVerificationToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
    ]);
    const isFirstVerification = count > 0;

    if (isFirstVerification) {
      await this.grantStartupBonus(record.userId);
    }
  }

  /** No-ops (rather than erroring) if already verified -- the caller (Profile/top-bar banner) just wants "send it" to always be safe to click. */
  async resendEmailVerification(userId: string): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.emailVerified) return;
    await this.issueEmailVerification(user);
  }

  // --- Profile / onboarding -------------------------------------------------

  async getProfile(userId: string): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { dialect: true, dialectVariant: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return toPublicUser(user);
  }

  async updateProfile(
    userId: string,
    fields: {
      originCountryId?: string;
      countryId?: string;
      dialectId?: string;
      dialectVariantId?: string | null;
      firstName?: string;
      lastName?: string;
      emailNotificationsEnabled?: boolean;
      smsNotificationsEnabled?: boolean;
      marketingNotificationsEnabled?: boolean;
      blogNewsNotificationsEnabled?: boolean;
      courseNotificationsEnabled?: boolean;
    },
  ): Promise<PublicUser> {
    const {
      originCountryId,
      countryId,
      dialectId,
      dialectVariantId,
      firstName,
      lastName,
      emailNotificationsEnabled,
      smsNotificationsEnabled,
      marketingNotificationsEnabled,
      blogNewsNotificationsEnabled,
      courseNotificationsEnabled,
    } = fields;

    if (originCountryId) {
      const originCountry = await this.prisma.country.findUnique({
        where: { id: originCountryId },
        select: { id: true },
      });
      if (!originCountry) {
        throw new UnprocessableEntityException(
          'Country of origin does not match an existing country',
        );
      }
    }

    if (countryId || dialectId) {
      if (!countryId || !dialectId) {
        throw new UnprocessableEntityException('countryId and dialectId must be set together');
      }
      const dialect = await this.prisma.dialect.findUnique({ where: { id: dialectId } });
      if (!dialect || dialect.countryId !== countryId) {
        throw new UnprocessableEntityException('Dialect does not belong to the given country');
      }
    }

    // Optional: a null/undefined value leaves the current variant
    // untouched unless dialectId is also changing (see below), an empty
    // string or explicit null clears it, and any other value must belong
    // to the dialect being set (or, if dialectId isn't changing, the
    // trainer's existing dialect) -- self-reported sub-dialect, no
    // verification, but it must at least point at a real variant of the
    // right dialect.
    if (dialectVariantId) {
      const effectiveDialectId =
        dialectId ??
        (await this.prisma.user.findUniqueOrThrow({ where: { id: userId } })).dialectId;
      const variant = await this.prisma.dialectVariant.findUnique({
        where: { id: dialectVariantId },
      });
      if (!variant || variant.dialectId !== effectiveDialectId) {
        throw new UnprocessableEntityException(
          'Dialect variant does not belong to the given dialect',
        );
      }
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(originCountryId ? { originCountryId } : {}),
        ...(countryId && dialectId ? { countryId, dialectId } : {}),
        // Changing dialectId without an explicit variant clears the old
        // one -- a variant of the previous dialect can never be valid for
        // a different one.
        ...(dialectVariantId !== undefined
          ? { dialectVariantId: dialectVariantId || null }
          : dialectId
            ? { dialectVariantId: null }
            : {}),
        ...(firstName !== undefined ? { firstName: firstName.trim() } : {}),
        ...(lastName !== undefined ? { lastName: lastName.trim() } : {}),
        ...(emailNotificationsEnabled !== undefined ? { emailNotificationsEnabled } : {}),
        ...(smsNotificationsEnabled !== undefined ? { smsNotificationsEnabled } : {}),
        ...(marketingNotificationsEnabled !== undefined ? { marketingNotificationsEnabled } : {}),
        ...(blogNewsNotificationsEnabled !== undefined ? { blogNewsNotificationsEnabled } : {}),
        ...(courseNotificationsEnabled !== undefined ? { courseNotificationsEnabled } : {}),
      },
      include: { dialect: true, dialectVariant: true },
    });

    return toPublicUser(user);
  }

  /**
   * Issues an SMS OTP to a candidate phone number, context-bound so the
   * code can't later be redeemed against a different number. Never trust
   * client-side E.164 validation alone -- re-validated here. When
   * SMSLive247 native OTP is selected while transactional OTP is off,
   * bypassing OtpCode/the SMS fallback chain entirely and using
   * SMSLive247's own token-generate API instead --
   * see smslive247-native-otp.ts's doc comment for why (their OTP-compliant
   * route generates the code itself; we never see or store it).
   */
  async requestPhoneVerificationOtp(userId: string, phoneNumber: string) {
    if (!isValidPhoneNumber(phoneNumber)) {
      throw new UnprocessableEntityException('Enter a valid phone number in international format');
    }
    const existing = await this.prisma.user.findUnique({
      where: { phoneNumber },
      select: { id: true },
    });
    if (existing && existing.id !== userId) {
      throw new ConflictException('This phone number is already verified on another account');
    }
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });

    const [smslive247NativeOtpEnabled, smsTransactionalOtpEnabled] = await Promise.all([
      this.platformSettings.isSmslive247NativeOtpEnabled(),
      this.platformSettings.isSmsTransactionalOtpEnabled(),
    ]);
    if (smslive247NativeOtpEnabled && !smsTransactionalOtpEnabled) {
      const smsSenderId = await this.platformSettings.getSmsSenderId();
      const { expiresAt } = await createSmslive247Otp(phoneNumber, smsSenderId ?? undefined);
      const expiresInSeconds = Math.max(
        0,
        Math.round((new Date(expiresAt).getTime() - Date.now()) / 1000),
      );
      return { otpRequestId: SMSLIVE247_NATIVE_OTP_REQUEST_ID, expiresInSeconds };
    }

    return this.otp.issueForUser(
      user.id,
      OtpPurpose.PHONE_VERIFICATION,
      phoneNumber,
      phoneVerificationContextHash(phoneNumber),
      'SMS',
    );
  }

  async verifyPhoneNumber(
    userId: string,
    phoneNumber: string,
    otpRequestId: string,
    code: string,
  ): Promise<PublicUser> {
    if (!isValidPhoneNumber(phoneNumber)) {
      throw new UnprocessableEntityException('Enter a valid phone number in international format');
    }

    if (otpRequestId === SMSLIVE247_NATIVE_OTP_REQUEST_ID) {
      const isValid = await verifySmslive247Otp(phoneNumber, code);
      if (!isValid) throw new UnauthorizedException('Invalid or expired code');
    } else {
      await this.otp.verify({
        otpRequestId,
        userId,
        purpose: OtpPurpose.PHONE_VERIFICATION,
        code,
        contextHash: phoneVerificationContextHash(phoneNumber),
      });
    }

    try {
      const user = await this.prisma.user.update({
        where: { id: userId },
        data: { phoneNumber, phoneVerifiedAt: new Date() },
        include: { dialect: true, dialectVariant: true },
      });
      return toPublicUser(user);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('This phone number is already verified on another account');
      }
      throw err;
    }
  }

  /**
   * Saves a phone number with no SMS OTP step at all -- only reachable
   * while PlatformSettings.phoneVerificationRequired is off. phoneVerifiedAt
   * is deliberately left null (not backfilled to "now"): this is an
   * unverified number, and nothing should ever read it as verified just
   * because the platform-wide requirement happens to be off today. A user
   * can still use the normal request/verify OTP flow above to actually
   * verify it at any time, on or off.
   */
  async savePhoneNumberUnverified(userId: string, phoneNumber: string): Promise<PublicUser> {
    if (await this.platformSettings.isPhoneVerificationRequired()) {
      throw new UnprocessableEntityException('Phone verification is required on this platform');
    }
    if (!isValidPhoneNumber(phoneNumber)) {
      throw new UnprocessableEntityException('Enter a valid phone number in international format');
    }
    try {
      const user = await this.prisma.user.update({
        where: { id: userId },
        data: { phoneNumber },
        include: { dialect: true, dialectVariant: true },
      });
      return toPublicUser(user);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('This phone number is already in use on another account');
      }
      throw err;
    }
  }

  async requestManualPhoneVerification(userId: string, phoneNumber: string) {
    const settings = await this.platformSettings.getManualPhoneVerificationSettings();
    if (!settings.enabled) {
      throw new UnprocessableEntityException('Manual phone verification is currently disabled');
    }
    if (!isValidPhoneNumber(phoneNumber)) {
      throw new UnprocessableEntityException('Enter a valid phone number in international format');
    }

    const existingPhoneOwner = await this.prisma.user.findFirst({
      where: { phoneNumber, id: { not: userId }, phoneVerifiedAt: { not: null } },
      select: { id: true },
    });
    if (existingPhoneOwner) {
      throw new ConflictException('This phone number is already verified on another account');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, phoneVerifiedAt: true },
    });
    if (!user) throw new NotFoundException('User not found');
    if (user.phoneVerifiedAt) {
      throw new ConflictException('Your phone number is already verified');
    }

    const now = new Date();
    await this.expireManualPhoneVerificationRequests(now);
    const pending = await this.prisma.manualPhoneVerificationRequest.findFirst({
      where: { userId, status: ManualPhoneVerificationStatus.PENDING, expiresAt: { gt: now } },
      select: { id: true },
    });
    if (pending) {
      throw new ConflictException('You already have a pending manual phone verification request');
    }

    const fee = new Prisma.Decimal(settings.feeTokens);
    const requestId = randomUUID();
    const { code, hash } = generateOtpCode();
    const expiresAt = new Date(now.getTime() + MANUAL_PHONE_VERIFICATION_TTL_MS);

    // No charge here -- the fee is only ever collected when an admin
    // actually confirms the OTP (see verifyManualPhoneVerificationRequest),
    // so a request that's later rejected or left to expire never cost the
    // trainer anything and there's nothing to refund. feeTokenAmount is
    // still recorded now (the fee admin has configured at request time) so
    // the trainer-facing confirmation copy and the admin list both show a
    // stable amount even if the setting changes before this gets reviewed.
    try {
      await this.prisma.$transaction([
        this.prisma.manualPhoneVerificationRequest.create({
          data: {
            id: requestId,
            userId,
            phoneNumber,
            otpHash: hash,
            feeTokenAmount: fee,
            expiresAt,
          },
        }),
        this.prisma.user.update({
          where: { id: userId },
          data: { phoneNumber, phoneVerifiedAt: null },
        }),
      ]);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('This phone number is already in use on another account');
      }
      throw err;
    }

    return {
      requestId,
      code,
      whatsappNumber: settings.whatsappNumber,
      feeTokenAmount: fee.toString(),
      expiresAt,
    };
  }

  async markManualPhoneVerificationSent(userId: string, requestId: string) {
    await this.expireManualPhoneVerificationRequests();
    const request = await this.prisma.manualPhoneVerificationRequest.findFirst({
      where: {
        id: requestId,
        userId,
        status: ManualPhoneVerificationStatus.PENDING,
        expiresAt: { gt: new Date() },
      },
      select: { id: true },
    });
    if (!request) {
      throw new NotFoundException('Pending manual verification request not found');
    }
    return this.prisma.manualPhoneVerificationRequest.update({
      where: { id: requestId },
      data: { sentAt: new Date() },
      select: { id: true, status: true, sentAt: true },
    });
  }

  async listManualPhoneVerificationRequests(params: {
    status?: ManualPhoneVerificationStatus;
    page: number;
    pageSize: number;
  }) {
    await this.expireManualPhoneVerificationRequests();
    const where = { ...(params.status ? { status: params.status } : {}) };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.manualPhoneVerificationRequest.count({ where }),
      this.prisma.manualPhoneVerificationRequest.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              phoneNumber: true,
              phoneVerifiedAt: true,
            },
          },
          verifiedByAdmin: { select: { id: true, email: true, firstName: true, lastName: true } },
        },
      }),
    ]);

    return {
      items: items.map((item) => ({
        id: item.id,
        phoneNumber: item.phoneNumber,
        status: item.status,
        feeTokenAmount: item.feeTokenAmount.toString(),
        sentAt: item.sentAt,
        verifiedAt: item.verifiedAt,
        rejectedAt: item.rejectedAt,
        expiresAt: item.expiresAt,
        createdAt: item.createdAt,
        user: {
          ...item.user,
          phoneVerified: item.user.phoneVerifiedAt !== null,
        },
        verifiedByAdmin: item.verifiedByAdmin,
      })),
      page: params.page,
      pageSize: params.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / params.pageSize)),
    };
  }

  async verifyManualPhoneVerificationRequest(adminId: string, requestId: string, code: string) {
    await this.expireManualPhoneVerificationRequests();
    const request = await this.prisma.manualPhoneVerificationRequest.findUnique({
      where: { id: requestId },
    });
    if (!request) throw new NotFoundException('Manual verification request not found');
    if (request.status !== ManualPhoneVerificationStatus.PENDING) {
      throw new UnprocessableEntityException('This verification request is no longer pending');
    }
    if (request.expiresAt < new Date()) {
      await this.expireManualPhoneVerificationRequests();
      throw new UnprocessableEntityException('This verification request has expired');
    }
    if (request.attempts >= request.maxAttempts) {
      throw new UnauthorizedException(
        'Too many incorrect attempts -- reject this request and ask the trainer to try again',
      );
    }

    if (hashOtpCode(code) !== request.otpHash) {
      // Same increment-then-reject pattern as OtpService.verify -- a wrong
      // guess is recorded even though the request stays PENDING, so repeated
      // wrong codes eventually trip maxAttempts above instead of allowing
      // unlimited brute-force against the 6-digit code.
      await this.prisma.manualPhoneVerificationRequest.updateMany({
        where: { id: requestId, status: ManualPhoneVerificationStatus.PENDING },
        data: { attempts: { increment: 1 } },
      });
      throw new UnauthorizedException('Invalid verification code');
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        // where: { status: PENDING } makes this claim atomic: if two verify
        // calls (or a verify racing a reject) land concurrently, only one
        // update actually matches a still-PENDING row -- count === 0 means
        // this call lost the race, not that anything is wrong with the code.
        const claim = await tx.manualPhoneVerificationRequest.updateMany({
          where: { id: requestId, status: ManualPhoneVerificationStatus.PENDING },
          data: {
            status: ManualPhoneVerificationStatus.VERIFIED,
            verifiedByAdminId: adminId,
            verifiedAt: new Date(),
          },
        });
        if (claim.count === 0) {
          throw new UnprocessableEntityException('This verification request is no longer pending');
        }

        // The fee is only ever collected here, on the admin's confirming
        // action -- not at request time (see requestManualPhoneVerification).
        // Gated on the trainer's CURRENT balance, which may have changed
        // since the request was created; insufficient funds rolls back the
        // whole transaction (claim included) so the request stays PENDING
        // for the admin to retry once the trainer tops up, rather than
        // silently verifying for free or leaving a half-applied state.
        if (request.feeTokenAmount.gt(0)) {
          const wallet = await tx.wallet.upsert({
            where: { userId: request.userId },
            create: { userId: request.userId },
            update: {},
          });
          const debited = await tx.wallet.updateMany({
            where: { userId: request.userId, balance: { gte: request.feeTokenAmount } },
            data: { balance: { decrement: request.feeTokenAmount } },
          });
          if (debited.count === 0) {
            throw new UnprocessableEntityException(
              `Trainer has insufficient DL for the ${request.feeTokenAmount.toString()} DL verification fee`,
            );
          }
          await tx.ledgerEntry.create({
            data: {
              walletId: wallet.id,
              type: LedgerEntryType.PHONE_VERIFICATION_FEE,
              amount: request.feeTokenAmount.mul(-1),
              reference: requestId,
            },
          });
        }

        await tx.user.update({
          where: { id: request.userId },
          data: { phoneNumber: request.phoneNumber, phoneVerifiedAt: new Date() },
        });
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('This phone number is already in use on another account');
      }
      throw err;
    }

    const item = await this.prisma.manualPhoneVerificationRequest.findUniqueOrThrow({
      where: { id: requestId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            phoneNumber: true,
            phoneVerifiedAt: true,
          },
        },
        verifiedByAdmin: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
    });

    // Best-effort: the verification itself already landed above (fee
    // debited, phoneVerifiedAt set) -- a Resend failure here must not unwind
    // or fail the admin's confirming action, same tolerance as
    // sendTrainingPayoutCreditedEmail's call site.
    try {
      await this.mail.sendPhoneVerifiedEmail(item.user.email, item.phoneNumber);
    } catch (err) {
      this.logger.warn(`Failed to send phone-verified email to ${item.user.email}: ${err}`);
    }

    return {
      id: item.id,
      phoneNumber: item.phoneNumber,
      status: item.status,
      feeTokenAmount: item.feeTokenAmount.toString(),
      sentAt: item.sentAt,
      verifiedAt: item.verifiedAt,
      rejectedAt: item.rejectedAt,
      expiresAt: item.expiresAt,
      createdAt: item.createdAt,
      user: { ...item.user, phoneVerified: item.user.phoneVerifiedAt !== null },
      verifiedByAdmin: item.verifiedByAdmin,
    };
  }

  async rejectManualPhoneVerificationRequest(adminId: string, requestId: string) {
    const request = await this.prisma.manualPhoneVerificationRequest.findUnique({
      where: { id: requestId },
    });
    if (!request) throw new NotFoundException('Manual verification request not found');
    if (request.status !== ManualPhoneVerificationStatus.PENDING) {
      throw new UnprocessableEntityException('This verification request is no longer pending');
    }
    const [claim] = await this.prisma.$transaction([
      this.prisma.manualPhoneVerificationRequest.updateMany({
        where: { id: requestId, status: ManualPhoneVerificationStatus.PENDING },
        data: {
          status: ManualPhoneVerificationStatus.REJECTED,
          verifiedByAdminId: adminId,
          rejectedAt: new Date(),
        },
      }),
    ]);
    if (claim.count === 0) {
      throw new UnprocessableEntityException('This verification request is no longer pending');
    }
    // No refund needed on reject -- the fee is only ever collected on
    // successful admin verification (see verifyManualPhoneVerificationRequest),
    // so a rejected request never charged the trainer anything.
    const item = await this.prisma.manualPhoneVerificationRequest.findUniqueOrThrow({
      where: { id: requestId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            phoneNumber: true,
            phoneVerifiedAt: true,
          },
        },
        verifiedByAdmin: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
    });
    return {
      id: item.id,
      phoneNumber: item.phoneNumber,
      status: item.status,
      feeTokenAmount: item.feeTokenAmount.toString(),
      sentAt: item.sentAt,
      verifiedAt: item.verifiedAt,
      rejectedAt: item.rejectedAt,
      expiresAt: item.expiresAt,
      createdAt: item.createdAt,
      user: { ...item.user, phoneVerified: item.user.phoneVerifiedAt !== null },
      verifiedByAdmin: item.verifiedByAdmin,
    };
  }

  private async expireManualPhoneVerificationRequests(now = new Date()): Promise<void> {
    // Same reasoning as rejectManualPhoneVerificationRequest -- an expired,
    // never-reviewed request never charged the trainer, so there's nothing
    // to refund here either.
    await this.prisma.manualPhoneVerificationRequest.updateMany({
      where: { status: ManualPhoneVerificationStatus.PENDING, expiresAt: { lt: now } },
      data: { status: ManualPhoneVerificationStatus.EXPIRED },
    });
  }

  // --- Admin: user management ------------------------------------------------

  async listUsers(filters: {
    role?: Role;
    status?: UserStatus;
    search?: string;
  }): Promise<PublicUser[]> {
    const search = filters.search?.trim();
    const users = await this.prisma.user.findMany({
      where: {
        role: filters.role,
        status: filters.status,
        ...(search
          ? {
              OR: [
                { email: { contains: search, mode: 'insensitive' as const } },
                { firstName: { contains: search, mode: 'insensitive' as const } },
                { lastName: { contains: search, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      include: {
        dialect: true,
        dialectVariant: true,
        wallet: { select: { balance: true } },
        _count: { select: { submissions: true, wordRecordings: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return users.map(toPublicUser);
  }

  async updateUserRole(userId: string, role: Role): Promise<PublicUser> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { role },
      include: { dialect: true, dialectVariant: true },
    });
    return toPublicUser(user);
  }

  /**
   * Disabling (SUSPENDED/BLOCKED) revokes every refresh token so the user
   * can't silently mint a new access token -- see assertActive. Re-enabling
   * (back to ACTIVE) does not restore old sessions; the user just logs in
   * again.
   */
  async updateUserStatus(userId: string, status: UserStatus): Promise<PublicUser> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { status },
      include: { dialect: true, dialectVariant: true },
    });

    if (status !== UserStatus.ACTIVE) {
      await this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    return toPublicUser(user);
  }

  async getAdminUser(id: string): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        dialect: true,
        dialectVariant: true,
        wallet: { select: { balance: true } },
        _count: { select: { submissions: true, wordRecordings: true } },
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return toPublicUser(user);
  }

  /**
   * Every ledger entry against this user's wallet, newest first -- the
   * "smart table of all token transactions" on the admin user detail page.
   * Same convention as DistributorsService.getActivity, but for any user
   * (not just role=DISTRIBUTOR).
   */
  async getUserActivity(userId: string, params: { page: number; pageSize: number }) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { wallet: true },
    });
    if (!user) throw new NotFoundException('User not found');
    if (!user.wallet) {
      return { items: [], page: params.page, pageSize: params.pageSize, total: 0, totalPages: 1 };
    }

    const where = { walletId: user.wallet.id };
    const [total, entries] = await this.prisma.$transaction([
      this.prisma.ledgerEntry.count({ where }),
      this.prisma.ledgerEntry.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
        select: { id: true, type: true, amount: true, reference: true, createdAt: true },
      }),
    ]);

    return {
      items: entries.map((entry) => ({ ...entry, amount: entry.amount.toString() })),
      page: params.page,
      pageSize: params.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / params.pageSize)),
    };
  }

  async requestUserLockOtp(adminId: string, userId: string, status: UserStatus) {
    if (userId === adminId)
      throw new BadRequestException('You cannot suspend or block your own account');
    const admin = await this.prisma.user.findUniqueOrThrow({ where: { id: adminId } });
    const contextHash = adminActionContextHash({ action: 'user-lock', userId, status });
    return this.otp.issueForUser(adminId, OtpPurpose.ADMIN_PAYOUT, admin.email, contextHash);
  }

  /**
   * The "kill switch": locking a user (SUSPENDED/BLOCKED) does everything
   * updateUserStatus already does (status flip + refresh-token revocation)
   * plus unwinds their open money-movement -- rejects any pending/approved
   * withdrawal (reversing the ledger debit, mirroring
   * WalletController.resolveWithdrawal's reject path exactly) and cancels
   * every open P2P offer/trade they're party to (refunding escrow via
   * P2PService.adminCancelAllForUser). Re-activating (status=ACTIVE) does
   * not go through this path -- see the controller's OTP gate, which only
   * applies to the two disabling values.
   */
  async lockUser(
    adminId: string,
    userId: string,
    status: UserStatus,
    otpRequestId?: string,
    code?: string,
  ): Promise<PublicUser> {
    if (userId === adminId)
      throw new BadRequestException('You cannot suspend or block your own account');

    if (await this.platformSettings.isAdminPayoutOtpEnabled()) {
      if (!otpRequestId || !code) {
        throw new UnprocessableEntityException('OTP verification is required to lock this user');
      }
      await this.otp.verify({
        otpRequestId,
        userId: adminId,
        purpose: OtpPurpose.ADMIN_PAYOUT,
        code,
        contextHash: adminActionContextHash({ action: 'user-lock', userId, status }),
      });
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { wallet: true, dialect: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { status },
      include: { dialect: true, dialectVariant: true },
    });
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    if (user.wallet) {
      const openWithdrawals = await this.prisma.withdrawalRequest.findMany({
        where: {
          walletId: user.wallet.id,
          status: { in: [WithdrawalStatus.PENDING, WithdrawalStatus.APPROVED] },
        },
      });
      for (const withdrawal of openWithdrawals) {
        await this.prisma.$transaction([
          this.prisma.withdrawalRequest.update({
            where: { id: withdrawal.id },
            data: {
              status: WithdrawalStatus.REJECTED,
              resolvedAt: new Date(),
              adminNote: 'Auto-rejected: account locked by admin',
            },
          }),
          this.prisma.ledgerEntry.create({
            data: {
              walletId: withdrawal.walletId,
              type: 'WITHDRAWAL_REVERSED',
              amount: withdrawal.tokenAmount,
              reference: withdrawal.id,
            },
          }),
          this.prisma.wallet.update({
            where: { id: withdrawal.walletId },
            data: { balance: { increment: withdrawal.tokenAmount } },
          }),
        ]);
      }
    }

    await this.p2p.adminCancelAllForUser(userId);

    this.logger.log(`User locked: admin=${adminId} user=${userId} status=${status}`);
    return toPublicUser(updated);
  }

  /**
   * Every trainer currently on an active audit hold, for the admin "Audit
   * queue" list. Fetches every candidate row (auditHoldAt set) and filters
   * with the same isOnAuditHold check used everywhere else, rather than
   * trying to express its release-after-hold comparison as a Prisma
   * where-clause -- this population is inherently small (bounded by how
   * often PlatformSettings.auditHoldEveryNSubmissions triggers), so an
   * in-app filter over a handful of rows is simpler and less error-prone
   * than duplicating isOnAuditHold's date-comparison logic in raw SQL.
   */
  async listAuditHoldUsers(): Promise<PublicUser[]> {
    const candidates = await this.prisma.user.findMany({
      where: { auditHoldAt: { not: null } },
      include: {
        dialect: true,
        dialectVariant: true,
        wallet: { select: { balance: true } },
        _count: { select: { submissions: true, wordRecordings: true } },
      },
      orderBy: { auditHoldAt: 'desc' },
    });
    return candidates.filter(isOnAuditHold).map(toPublicUser);
  }

  async requestAuditHoldReleaseOtp(adminId: string, userId: string) {
    const admin = await this.prisma.user.findUniqueOrThrow({ where: { id: adminId } });
    const contextHash = adminActionContextHash({ action: 'audit-hold-release', userId });
    return this.otp.issueForUser(adminId, OtpPurpose.ADMIN_PAYOUT, admin.email, contextHash);
  }

  /**
   * Clears an automatic audit hold (see WordsService.createRecording) once
   * an admin has reviewed the trainer's recent submissions. Distinct from
   * lockUser/updateUserStatus -- this never touches `status`, only the
   * auditHold* fields, so a trainer who was independently SUSPENDED/BLOCKED
   * stays that way even after their audit hold is released.
   */
  async releaseAuditHold(
    adminId: string,
    userId: string,
    otpRequestId?: string,
    code?: string,
  ): Promise<PublicUser> {
    if (await this.platformSettings.isAdminPayoutOtpEnabled()) {
      if (!otpRequestId || !code) {
        throw new UnprocessableEntityException(
          'OTP verification is required to release this audit hold',
        );
      }
      await this.otp.verify({
        otpRequestId,
        userId: adminId,
        purpose: OtpPurpose.ADMIN_PAYOUT,
        code,
        contextHash: adminActionContextHash({ action: 'audit-hold-release', userId }),
      });
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (!isOnAuditHold(user)) {
      throw new BadRequestException('This account is not currently on an audit hold');
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { auditHoldReleasedAt: new Date(), auditHoldReleasedById: adminId },
      include: { dialect: true, dialectVariant: true },
    });

    this.logger.log(`Audit hold released: admin=${adminId} user=${userId}`);

    try {
      await this.mail.sendAuditHoldReleasedEmail(user.email);
    } catch (err) {
      this.logger.error(
        `Failed to send audit-hold-released email for user=${userId}: ${(err as Error).message}`,
      );
    }

    return toPublicUser(updated);
  }

  async requestUserDeleteOtp(adminId: string, userId: string) {
    if (userId === adminId) throw new BadRequestException('You cannot delete your own account');
    const admin = await this.prisma.user.findUniqueOrThrow({ where: { id: adminId } });
    const contextHash = adminActionContextHash({ action: 'user-delete', userId });
    return this.otp.issueForUser(adminId, OtpPurpose.ADMIN_PAYOUT, admin.email, contextHash);
  }

  /**
   * Permanent delete -- the user can sign up again afterward with the same
   * email, but this specific account and all its cascading data (wallet,
   * ledger, sessions, submissions, P2P history, etc. -- see the onDelete:
   * Cascade relations on User in schema.prisma) is gone for good. Blocked
   * (not reassigned) when the user authored content that the schema
   * protects with onDelete: Restrict -- blog posts, courses, opened
   * subscription pools -- so deleting a user can never silently orphan or
   * relabel content someone else may be relying on the authorship of.
   */
  async deleteUser(
    adminId: string,
    userId: string,
    otpRequestId?: string,
    code?: string,
  ): Promise<{ id: string; deleted: boolean }> {
    if (userId === adminId) throw new BadRequestException('You cannot delete your own account');

    if (await this.platformSettings.isAdminPayoutOtpEnabled()) {
      if (!otpRequestId || !code) {
        throw new UnprocessableEntityException('OTP verification is required to delete this user');
      }
      await this.otp.verify({
        otpRequestId,
        userId: adminId,
        purpose: OtpPurpose.ADMIN_PAYOUT,
        code,
        contextHash: adminActionContextHash({ action: 'user-delete', userId }),
      });
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const [blogPostCount, courseCount, subscriptionPoolCount] = await Promise.all([
      this.prisma.blogPost.count({ where: { authorId: userId } }),
      this.prisma.course.count({ where: { authorId: userId } }),
      this.prisma.subscriptionPool.count({ where: { openedByUserId: userId } }),
    ]);
    if (blogPostCount > 0 || courseCount > 0 || subscriptionPoolCount > 0) {
      throw new UnprocessableEntityException(
        'This user authored blog posts, courses, or opened subscription pools -- reassign or remove that content before deleting the account',
      );
    }

    await this.deleteUserAudio(userId);
    await this.prisma.user.delete({ where: { id: userId } });
    this.logger.log(`User deleted: admin=${adminId} user=${userId}`);
    return { id: userId, deleted: true };
  }

  /**
   * Best-effort Spaces cleanup ahead of the cascading Prisma delete --
   * without this, a deleted user's recording audio was previously orphaned
   * in Spaces forever (the row disappears via onDelete: Cascade, but nothing
   * ever deleted the actual object). A Spaces API failure here is logged and
   * swallowed, not thrown -- account deletion must not be blockable by an
   * unrelated storage-provider hiccup, matching this codebase's existing
   * tolerance for non-critical cleanup steps.
   */
  private async deleteUserAudio(userId: string): Promise<void> {
    const [submissions, wordRecordings] = await Promise.all([
      this.prisma.submission.findMany({
        where: { userId, audioBucket: { not: null }, audioKey: { not: null } },
        select: { audioBucket: true, audioKey: true },
      }),
      this.prisma.wordRecording.findMany({
        where: { userId, audioBucket: { not: null }, audioKey: { not: null } },
        select: { audioBucket: true, audioKey: true },
      }),
    ]);

    for (const { audioBucket, audioKey } of [...submissions, ...wordRecordings]) {
      if (!audioBucket || !audioKey) continue;
      try {
        await this.storage.deleteObject(audioBucket, audioKey);
      } catch (err) {
        this.logger.warn(
          `Failed to delete audio object during user deletion: bucket=${audioBucket} key=${audioKey} err=${err}`,
        );
      }
    }
  }

  // --- Shared token issuance ------------------------------------------------

  private async issueAuthResult(user: User): Promise<AuthResult> {
    const { token: refreshToken, hash } = generateOpaqueToken();
    const familyId = randomUUID();

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hash,
        familyId,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      },
    });

    return {
      accessToken: signAccessToken({ sub: user.id, email: user.email, role: user.role }),
      refreshToken,
      user: toPublicUser(user),
    };
  }
}

import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { randomBytes, randomUUID } from 'crypto';
import { AuthProvider, OtpPurpose, Prisma, Role, User, UserStatus } from '@dialectiva/db';
import { isValidPhoneNumber } from 'libphonenumber-js';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { OtpService } from '../otp/otp.service';
import { PlatformSettingsService } from '../settings/platform-settings.service';
import { createSmslive247Otp, verifySmslive247Otp } from '../sms/smslive247-native-otp';
import { generateOpaqueToken, hashToken } from './token.util';
import { signAccessToken } from './jwt.util';
import { phoneVerificationContextHash } from './phone-otp-context.util';

const SMSLIVE247_NATIVE_OTP_REQUEST_ID = 'smslive247-native';

const BCRYPT_ROUNDS = 12;
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // 1 hour
const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAGIC_LINK_TTL_MS = 15 * 60 * 1000; // 15 minutes

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
  countryId: string | null;
  dialectId: string | null;
  dialectTag: string | null;
  onboardingComplete: boolean;
  referralCode: string;
  emailNotificationsEnabled: boolean;
  smsNotificationsEnabled: boolean;
  marketingNotificationsEnabled: boolean;
  blogNewsNotificationsEnabled: boolean;
}

type UserWithDialect = User & { dialect?: { tag: string } | null };

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
    countryId: user.countryId,
    dialectId: user.dialectId,
    dialectTag: user.dialect?.tag ?? null,
    onboardingComplete: user.countryId !== null && user.dialectId !== null,
    referralCode: user.referralCode,
    emailNotificationsEnabled: user.emailNotificationsEnabled,
    smsNotificationsEnabled: user.smsNotificationsEnabled,
    marketingNotificationsEnabled: user.marketingNotificationsEnabled,
    blogNewsNotificationsEnabled: user.blogNewsNotificationsEnabled,
  };
}

// Short, URL-safe, not guessable-in-sequence -- good enough for a referral
// link slug (not a security token, just needs to avoid collisions and look
// clean in a URL). Collision odds at this length are negligible for this
// user base; the DB unique constraint is the actual backstop.
function generateReferralCode(): string {
  return randomBytes(6).toString('base64url');
}

function emailDomain(email: string): string {
  return email.split('@')[1]?.toLowerCase() ?? email.toLowerCase();
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly otp: OtpService,
    private readonly platformSettings: PlatformSettingsService,
  ) {}

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
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const referredById = await this.resolveReferrerId(referralCode, email);

    const user = await this.prisma.user.create({
      data: { email, passwordHash, firstName, lastName, referralCode: generateReferralCode(), referredById },
    });

    await this.issueEmailVerification(user);

    const { ticket, expiresInSeconds } = await this.otp.issueWithTicket(user.id, OtpPurpose.REGISTRATION, user.email);
    return { otpRequired: true, ticket, expiresInSeconds };
  }

  /**
   * A typo'd/stale referral code shouldn't block signup -- registration
   * proceeds either way, just without attribution if the code doesn't
   * resolve. Same-email-domain check is a minimal anti-abuse guard against
   * the most obvious self-referral case (registering throwaway accounts on
   * your own link to farm bonuses); it doesn't stop a determined abuser
   * with multiple real domains, but that's an explicit, accepted tradeoff
   * for v1 -- see plan "Anti-abuse scope".
   */
  private async resolveReferrerId(referralCode: string | undefined, newUserEmail: string): Promise<string | undefined> {
    if (!referralCode) {
      return undefined;
    }
    const referrer = await this.prisma.user.findUnique({ where: { referralCode } });
    if (!referrer) {
      return undefined;
    }
    if (emailDomain(referrer.email) === emailDomain(newUserEmail)) {
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
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user?.passwordHash) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    this.assertActive(user);

    const { ticket, expiresInSeconds } = await this.otp.issueWithTicket(user.id, OtpPurpose.LOGIN, user.email);
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
      const [, user] = await this.prisma.$transaction([
        this.prisma.otpCode.update({ where: { id: row.id }, data: { consumedAt: new Date() } }),
        this.prisma.user.update({ where: { id: row.userId }, data: { emailVerified: new Date() } }),
      ]);
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
      throw new UnauthorizedException('This account has been ' + (user.status === UserStatus.BLOCKED ? 'blocked' : 'suspended'));
    }
  }

  // --- Magic-link, persisted after NextAuth verifies the identity ---

  async requestMagicLink(email: string): Promise<void> {
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
      data: { userId: user.id, tokenHash: hash, expiresAt: new Date(Date.now() + MAGIC_LINK_TTL_MS) },
    });

    await this.mail.sendMagicLinkEmail(email, token);
  }

  async consumeMagicLink(token: string): Promise<AuthResult> {
    const hash = hashToken(token);
    const record = await this.prisma.emailVerificationToken.findUnique({ where: { tokenHash: hash } });
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired magic link');
    }

    const [user] = await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        data: { emailVerified: new Date() },
      }),
      this.prisma.emailVerificationToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
    ]);

    this.assertActive(user);

    let account = await this.prisma.linkedAccount.findUnique({
      where: { provider_providerAccountId: { provider: AuthProvider.EMAIL, providerAccountId: user.email } },
    });
    if (!account) {
      account = await this.prisma.linkedAccount.create({
        data: { userId: user.id, provider: AuthProvider.EMAIL, providerAccountId: user.email },
      });
    }

    return this.issueAuthResult(user);
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
      this.logger.warn(`Refresh token reuse detected for family=${record.familyId}; revoking family`);
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
      data: { userId: user.id, tokenHash: hash, expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS) },
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
      this.prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
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
      data: { userId: user.id, tokenHash: hash, expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS) },
    });
    await this.mail.sendEmailVerificationEmail(user.email, token);
  }

  async verifyEmail(token: string): Promise<void> {
    const hash = hashToken(token);
    const record = await this.prisma.emailVerificationToken.findUnique({ where: { tokenHash: hash } });
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired verification token');
    }

    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: record.userId }, data: { emailVerified: new Date() } }),
      this.prisma.emailVerificationToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    ]);
  }

  /** No-ops (rather than erroring) if already verified -- the caller (Profile/top-bar banner) just wants "send it" to always be safe to click. */
  async resendEmailVerification(userId: string): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.emailVerified) return;
    await this.issueEmailVerification(user);
  }

  // --- Profile / onboarding -------------------------------------------------

  async getProfile(userId: string): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, include: { dialect: true } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return toPublicUser(user);
  }

  async updateProfile(
    userId: string,
    fields: {
      countryId?: string;
      dialectId?: string;
      firstName?: string;
      lastName?: string;
      emailNotificationsEnabled?: boolean;
      smsNotificationsEnabled?: boolean;
      marketingNotificationsEnabled?: boolean;
      blogNewsNotificationsEnabled?: boolean;
    },
  ): Promise<PublicUser> {
    const {
      countryId,
      dialectId,
      firstName,
      lastName,
      emailNotificationsEnabled,
      smsNotificationsEnabled,
      marketingNotificationsEnabled,
      blogNewsNotificationsEnabled,
    } = fields;

    if (countryId || dialectId) {
      if (!countryId || !dialectId) {
        throw new UnprocessableEntityException('countryId and dialectId must be set together');
      }
      const dialect = await this.prisma.dialect.findUnique({ where: { id: dialectId } });
      if (!dialect || dialect.countryId !== countryId) {
        throw new UnprocessableEntityException('Dialect does not belong to the given country');
      }
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(countryId && dialectId ? { countryId, dialectId } : {}),
        ...(firstName !== undefined ? { firstName: firstName.trim() } : {}),
        ...(lastName !== undefined ? { lastName: lastName.trim() } : {}),
        ...(emailNotificationsEnabled !== undefined ? { emailNotificationsEnabled } : {}),
        ...(smsNotificationsEnabled !== undefined ? { smsNotificationsEnabled } : {}),
        ...(marketingNotificationsEnabled !== undefined ? { marketingNotificationsEnabled } : {}),
        ...(blogNewsNotificationsEnabled !== undefined ? { blogNewsNotificationsEnabled } : {}),
      },
      include: { dialect: true },
    });

    return toPublicUser(user);
  }

  /**
   * Issues an SMS OTP to a candidate phone number, context-bound so the
   * code can't later be redeemed against a different number. Never trust
   * client-side E.164 validation alone -- re-validated here. When
   * smslive247NativeOtpEnabled is on, bypasses OtpCode/the SMS fallback
   * chain entirely and uses SMSLive247's own token-generate API instead --
   * see smslive247-native-otp.ts's doc comment for why (their OTP-compliant
   * route generates the code itself; we never see or store it).
   */
  async requestPhoneVerificationOtp(userId: string, phoneNumber: string) {
    if (!isValidPhoneNumber(phoneNumber)) {
      throw new UnprocessableEntityException('Enter a valid phone number in international format');
    }
    const existing = await this.prisma.user.findUnique({ where: { phoneNumber }, select: { id: true } });
    if (existing && existing.id !== userId) {
      throw new ConflictException('This phone number is already verified on another account');
    }
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });

    if (await this.platformSettings.isSmslive247NativeOtpEnabled()) {
      const { expiresAt } = await createSmslive247Otp(phoneNumber);
      const expiresInSeconds = Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 1000));
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

  async verifyPhoneNumber(userId: string, phoneNumber: string, otpRequestId: string, code: string): Promise<PublicUser> {
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
        include: { dialect: true },
      });
      return toPublicUser(user);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('This phone number is already verified on another account');
      }
      throw err;
    }
  }

  // --- Admin: user management ------------------------------------------------

  async listUsers(filters: { role?: Role; status?: UserStatus; search?: string }): Promise<PublicUser[]> {
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
      include: { dialect: true },
      orderBy: { createdAt: 'desc' },
    });
    return users.map(toPublicUser);
  }

  async updateUserRole(userId: string, role: Role): Promise<PublicUser> {
    const user = await this.prisma.user.update({ where: { id: userId }, data: { role }, include: { dialect: true } });
    return toPublicUser(user);
  }

  /**
   * Disabling (SUSPENDED/BLOCKED) revokes every refresh token so the user
   * can't silently mint a new access token -- see assertActive. Re-enabling
   * (back to ACTIVE) does not restore old sessions; the user just logs in
   * again.
   */
  async updateUserStatus(userId: string, status: UserStatus): Promise<PublicUser> {
    const user = await this.prisma.user.update({ where: { id: userId }, data: { status }, include: { dialect: true } });

    if (status !== UserStatus.ACTIVE) {
      await this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    return toPublicUser(user);
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

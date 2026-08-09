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
import { AuthProvider, Role, User, UserStatus } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { generateOpaqueToken, hashToken } from './token.util';
import { signAccessToken } from './jwt.util';

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

export interface PublicUser {
  id: string;
  email: string;
  role: Role;
  status: UserStatus;
  emailVerified: boolean;
  countryId: string | null;
  dialectId: string | null;
  dialectTag: string | null;
  onboardingComplete: boolean;
  referralCode: string;
}

type UserWithDialect = User & { dialect?: { tag: string } | null };

function toPublicUser(user: UserWithDialect): PublicUser {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    status: user.status,
    emailVerified: user.emailVerified !== null,
    countryId: user.countryId,
    dialectId: user.dialectId,
    dialectTag: user.dialect?.tag ?? null,
    onboardingComplete: user.countryId !== null && user.dialectId !== null,
    referralCode: user.referralCode,
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
  ) {}

  // --- Registration / credentials login ---------------------------------

  async register(email: string, password: string, referralCode?: string): Promise<AuthResult> {
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const referredById = await this.resolveReferrerId(referralCode, email);

    const user = await this.prisma.user.create({
      data: { email, passwordHash, referralCode: generateReferralCode(), referredById },
    });

    await this.issueEmailVerification(user);

    return this.issueAuthResult(user);
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

  async login(email: string, password: string): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user?.passwordHash) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    this.assertActive(user);

    return this.issueAuthResult(user);
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

  // --- Profile / onboarding -------------------------------------------------

  async getProfile(userId: string): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, include: { dialect: true } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return toPublicUser(user);
  }

  async updateProfile(userId: string, countryId: string, dialectId: string): Promise<PublicUser> {
    const dialect = await this.prisma.dialect.findUnique({ where: { id: dialectId } });
    if (!dialect || dialect.countryId !== countryId) {
      throw new UnprocessableEntityException('Dialect does not belong to the given country');
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { countryId, dialectId },
      include: { dialect: true },
    });

    return toPublicUser(user);
  }

  // --- Admin: user management ------------------------------------------------

  async listUsers(filters: { role?: Role; status?: UserStatus; search?: string }): Promise<PublicUser[]> {
    const users = await this.prisma.user.findMany({
      where: {
        role: filters.role,
        status: filters.status,
        email: filters.search ? { contains: filters.search, mode: 'insensitive' } : undefined,
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

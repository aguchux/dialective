import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { OtpPurpose } from '@dialectiva/db';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { SmsService } from '../sms/sms.service';
import { SmsDeliveryException } from '../sms/sms-delivery.exception';
import { generateOpaqueToken, hashToken } from '../auth/token.util';
import { generateOtpCode, hashOtpCode } from './otp.util';

export type OtpChannel = 'EMAIL' | 'SMS';

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_TTL_SECONDS = OTP_TTL_MS / 1000;

export interface IssuedTicketOtp {
  ticket: string;
  expiresInSeconds: number;
}

export interface IssuedRequestOtp {
  otpRequestId: string;
  expiresInSeconds: number;
}

/**
 * Shared OTP CRUD for every purpose (registration/login/withdrawal/deposit/
 * admin-payout) -- see OtpCode's doc comment in schema.prisma for why this
 * is one table/service rather than one per purpose. Two issuance shapes:
 *   - issueWithTicket: for pre-auth flows (registration/login) where the
 *     caller isn't authenticated yet -- returns an opaque ticket the client
 *     must present alongside the code, since there's no req.user to bind to.
 *   - issueForUser: for authenticated flows (wallet/admin transactions)
 *     where req.user.sub already identifies the caller -- returns the row id
 *     directly (no ticket needed) plus, when contextHash is supplied, binds
 *     the code to the exact transaction details it was issued for.
 */
@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly sms: SmsService,
  ) {}

  /**
   * Falls back to the user's own email whenever every configured SMS
   * provider fails (SmsDeliveryException) -- SMS is only ever PREFERRED for
   * deliverability, never the sole channel a trainer can be stuck on. Some
   * countries have thin/no coverage from the configured provider order (see
   * SmsFallbackChain), and without this fallback a trainer with a verified
   * phone in one of those countries could never receive ANY OTP for a
   * mandatory security step (withdrawal, payout account setup, etc.) -- a
   * dead end with no recovery path. userId is looked up here (rather than
   * threading an extra parameter through every call site) since every
   * caller already has the row and this keeps every existing
   * issueForUser/issueWithTicket/resend call site unchanged.
   */
  private async deliver(
    channel: OtpChannel,
    destination: string,
    code: string,
    purpose: OtpPurpose,
    userId: string,
  ): Promise<void> {
    if (channel !== 'SMS') {
      await this.mail.sendOtpEmail(destination, code, purpose);
      return;
    }
    try {
      await this.sms.sendOtp(destination, code);
    } catch (err) {
      if (!(err instanceof SmsDeliveryException)) throw err;
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { email: true },
      });
      if (!user) throw err;
      this.logger.warn(
        `SMS delivery failed for user=${userId} purpose=${purpose}; falling back to email`,
      );
      await this.mail.sendOtpEmail(user.email, code, purpose);
    }
  }

  async issueWithTicket(
    userId: string,
    purpose: OtpPurpose,
    destination: string,
    channel: OtpChannel = 'EMAIL',
  ): Promise<IssuedTicketOtp> {
    const { code, hash: codeHash } = generateOtpCode();
    const { token: ticket, hash: ticketHash } = generateOpaqueToken();
    const expiresAt = new Date(Date.now() + OTP_TTL_MS);

    await this.prisma.otpCode.create({
      data: { userId, purpose, codeHash, ticketHash, expiresAt },
    });
    await this.deliver(channel, destination, code, purpose, userId);

    return { ticket, expiresInSeconds: OTP_TTL_SECONDS };
  }

  async issueForUser(
    userId: string,
    purpose: OtpPurpose,
    destination: string,
    contextHash: string | null,
    channel: OtpChannel = 'EMAIL',
  ): Promise<IssuedRequestOtp> {
    const { code, hash: codeHash } = generateOtpCode();
    const expiresAt = new Date(Date.now() + OTP_TTL_MS);

    const row = await this.prisma.otpCode.create({
      data: { userId, purpose, codeHash, contextHash, expiresAt },
    });
    await this.deliver(channel, destination, code, purpose, userId);

    return { otpRequestId: row.id, expiresInSeconds: OTP_TTL_SECONDS };
  }

  /**
   * Regenerates the code on the same still-pending row (keeps the same
   * ticket/otpRequestId/contextHash so the client doesn't need to re-fetch
   * an id) -- simpler than minting a fresh row, and equally safe since the
   * old code is overwritten (no longer valid) the moment this runs. Routes
   * to SMS for PHONE_VERIFICATION (destination = user.phoneNumber, set by
   * the same request that created this row) always -- deliberately no
   * email fallback here, since the whole point of this purpose is proving
   * phone ownership, which an emailed code cannot do. LOGIN uses SMS when
   * the user has SMS 2FA enabled (matching AuthService.login's issuance
   * choice), falling back to email if every SMS provider fails -- same
   * deliverability guarantee as OtpService.deliver, since a mandatory
   * security step must never have a channel-coverage dead end.
   */
  async resend(idOrTicket: string, byTicket: boolean): Promise<void> {
    const row = byTicket
      ? await this.prisma.otpCode.findUnique({ where: { ticketHash: hashToken(idOrTicket) } })
      : await this.prisma.otpCode.findUnique({ where: { id: idOrTicket } });

    if (!row || row.consumedAt || row.expiresAt < new Date()) {
      throw new UnauthorizedException('This code request is no longer valid');
    }

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: row.userId } });
    const { code, hash: codeHash } = generateOtpCode();
    const expiresAt = new Date(Date.now() + OTP_TTL_MS);

    await this.prisma.otpCode.update({
      where: { id: row.id },
      data: { codeHash, expiresAt, attempts: 0 },
    });

    if (row.purpose === 'PHONE_VERIFICATION') {
      if (!user.phoneNumber)
        throw new UnauthorizedException('This code request is no longer valid');
      await this.sms.sendOtp(user.phoneNumber, code);
      return;
    }

    const useSms = row.purpose === 'LOGIN' && user.twoFactorSmsEnabled && !!user.phoneVerifiedAt;
    if (useSms && user.phoneNumber) {
      try {
        await this.sms.sendOtp(user.phoneNumber, code);
        return;
      } catch (err) {
        if (!(err instanceof SmsDeliveryException)) throw err;
        this.logger.warn(
          `SMS delivery failed for user=${user.id} purpose=${row.purpose}; falling back to email`,
        );
      }
    }
    await this.mail.sendOtpEmail(user.email, code, row.purpose);
  }

  /**
   * Looks up by ticket (pre-auth flows) or by id (authenticated flows),
   * validates purpose/expiry/lockout/context binding, compares the code,
   * and on success marks the row consumed -- all in one call so every
   * caller enforces the same checks in the same order. Throws
   * UnauthorizedException with a generic message on any failure (never
   * reveals which specific check failed, to avoid leaking state to a
   * brute-forcer). Does NOT run inside a transaction by default; callers
   * that need the consume-write to be atomic with a balance debit (e.g.
   * withdrawal) should use verifyWithoutConsuming + consumeInTransaction
   * instead.
   */
  async verify(params: {
    ticket?: string;
    otpRequestId?: string;
    userId?: string;
    purpose: OtpPurpose;
    code: string;
    contextHash?: string;
  }) {
    const row = await this.loadAndValidate(params);
    await this.prisma.otpCode.update({ where: { id: row.id }, data: { consumedAt: new Date() } });
    return row;
  }

  /** Read-only validation, no write -- pairs with a caller-supplied transaction that folds in the consume write itself. */
  async verifyWithoutConsuming(params: {
    ticket?: string;
    otpRequestId?: string;
    userId?: string;
    purpose: OtpPurpose;
    code: string;
    contextHash?: string;
  }) {
    return this.loadAndValidate(params);
  }

  private async loadAndValidate(params: {
    ticket?: string;
    otpRequestId?: string;
    userId?: string;
    purpose: OtpPurpose;
    code: string;
    contextHash?: string;
  }) {
    const row = params.ticket
      ? await this.prisma.otpCode.findUnique({ where: { ticketHash: hashToken(params.ticket) } })
      : params.otpRequestId
        ? await this.prisma.otpCode.findUnique({ where: { id: params.otpRequestId } })
        : null;

    const invalid = () => new UnauthorizedException('Invalid or expired code');

    if (!row || row.purpose !== params.purpose) throw invalid();
    if (params.userId && row.userId !== params.userId) throw invalid();
    if (row.consumedAt || row.expiresAt < new Date()) throw invalid();
    if (row.attempts >= row.maxAttempts) throw invalid();
    if (params.contextHash !== undefined && row.contextHash !== params.contextHash) {
      throw new UnauthorizedException('This code was issued for a different transaction');
    }

    if (hashOtpCode(params.code) !== row.codeHash) {
      await this.prisma.otpCode.update({
        where: { id: row.id },
        data: { attempts: { increment: 1 } },
      });
      throw invalid();
    }

    return row;
  }
}

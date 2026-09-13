import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { OtpPurpose } from '@dialectiva/db';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { SmsService } from '../sms/sms.service';
import { SmsDeliveryException } from '../sms/sms-delivery.exception';
import { WhatsappService } from '../sms/whatsapp.service';
import { WhatsappDeliveryException } from '../sms/whatsapp-delivery.exception';
import { generateOpaqueToken, hashToken } from '../auth/token.util';
import { generateOtpCode, hashOtpCode } from './otp.util';

export type OtpChannel = 'EMAIL' | 'SMS' | 'WHATSAPP';

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
    private readonly whatsapp: WhatsappService,
  ) {}

  /**
   * Sends the code on BOTH channels whenever SMS or WHATSAPP is in play,
   * rather than picking one -- a trainer with thin SMS coverage for their
   * country (see SmsFallbackChain / smsProviderOrder), or a mis/under-
   * configured MailerSend WhatsApp setup (see PlatformSettingsService.
   * getWhatsappConfig), must never be left with zero delivered codes just
   * because that channel was preferred. destination/channel (from
   * resolveOtpDestination) still decides the PRIMARY channel and is used as
   * the sole channel when there's no phone to dual-send to (e.g. unverified
   * phone -- channel is EMAIL and destination is the email); once SMS or
   * WHATSAPP is the channel, email always goes out too, in parallel, using
   * the user's own email address looked up here (rather than threading an
   * extra parameter through every call site, since every caller already has
   * the row). A failed provider no longer needs to be caught specially -- it
   * simply means only the email side landed, which already happened
   * unconditionally.
   */
  private async deliver(
    channel: OtpChannel,
    destination: string,
    code: string,
    purpose: OtpPurpose,
    userId: string,
  ): Promise<void> {
    if (channel === 'EMAIL') {
      await this.mail.sendOtpEmail(destination, code, purpose);
      return;
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    const primarySend =
      channel === 'WHATSAPP' ? this.whatsapp.sendOtp(destination, code) : this.sms.sendOtp(destination, code);
    const expectedException = channel === 'WHATSAPP' ? WhatsappDeliveryException : SmsDeliveryException;
    const channelLabel = channel === 'WHATSAPP' ? 'WhatsApp' : 'SMS';
    const results = await Promise.allSettled([
      primarySend,
      ...(user ? [this.mail.sendOtpEmail(user.email, code, purpose)] : []),
    ]);
    const [primaryResult, mailResult] = results;
    if (primaryResult.status === 'rejected' && !(primaryResult.reason instanceof expectedException)) {
      throw primaryResult.reason;
    }
    if (primaryResult.status === 'rejected') {
      this.logger.warn(`${channelLabel} delivery failed for user=${userId} purpose=${purpose}`);
    }
    if (mailResult?.status === 'rejected') {
      this.logger.warn(`Email delivery failed for user=${userId} purpose=${purpose}`);
    }
    if (primaryResult.status === 'rejected' && (!mailResult || mailResult.status === 'rejected')) {
      throw primaryResult.reason;
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
   * the same request that created this row) always -- deliberately no email
   * dual-send here, since the whole point of this purpose is proving phone
   * ownership, which an emailed code cannot do. LOGIN dual-sends SMS+email
   * whenever the user has SMS 2FA enabled (matching AuthService.login's
   * issuance choice) regardless of whether email 2FA is also on -- same
   * deliverability guarantee as OtpService.deliver, since a mandatory
   * security step must never have a channel-coverage dead end, even one
   * gated behind an opt-in 2FA preference.
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
      const results = await Promise.allSettled([
        this.sms.sendOtp(user.phoneNumber, code),
        this.mail.sendOtpEmail(user.email, code, row.purpose),
      ]);
      const [smsResult, mailResult] = results;
      if (smsResult.status === 'rejected') {
        this.logger.warn(`SMS delivery failed for user=${user.id} purpose=${row.purpose}`);
      }
      if (mailResult.status === 'rejected') {
        this.logger.warn(`Email delivery failed for user=${user.id} purpose=${row.purpose}`);
        if (smsResult.status === 'rejected') throw smsResult.reason;
      }
      return;
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

import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { LedgerEntryType, Prisma, WhatsAppValidationRequestStatus } from '@dialectiva/db';
import { randomUUID } from 'crypto';
import { isValidPhoneNumber } from 'libphonenumber-js';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { IntegrationsService } from '../integrations/integrations.service';
import { generateOtpCode, hashOtpCode } from '../otp/otp.util';

const INTEGRATION_SLUG = 'whatsapp-validator';
const REQUEST_EXPIRY_MINUTES = 60 * 24; // 24h -- same order of magnitude as ManualPhoneVerificationRequest's admin-configurable expiry, fixed here since this integration's params live on the Integration row, not a bespoke settings table
const CLAIM_TTL_MINUTES = 10; // an inactive validator's claim falls back into the pool after this

/**
 * Peer-driven counterpart to AuthService's manual (admin-reviewed) phone
 * verification -- same platform-generated/hashed-code mechanics (see
 * otp.util.ts), but the reviewer is a subscribed peer validator claimed
 * from a pool instead of an admin, and the fee is actually paid out to
 * that validator instead of just being debited. Independent of
 * ManualPhoneVerificationRequest; both write user.phoneVerifiedAt, neither
 * knows about the other.
 */
@Injectable()
export class WhatsAppValidatorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly integrations: IntegrationsService,
  ) {}

  async requestVerification(userId: string, phoneNumber: string) {
    const integration = await this.integrations.requireEnabled(INTEGRATION_SLUG);
    if (!isValidPhoneNumber(phoneNumber)) {
      throw new UnprocessableEntityException('Enter a valid phone number in international format');
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
    await this.expireStale(now);
    const pending = await this.prisma.whatsAppValidationRequest.findFirst({
      where: {
        requesterId: userId,
        status: { in: [WhatsAppValidationRequestStatus.PENDING, WhatsAppValidationRequestStatus.CLAIMED] },
        expiresAt: { gt: now },
      },
      select: { id: true },
    });
    if (pending) {
      throw new ConflictException('You already have a pending WhatsApp validation request');
    }

    const requestId = randomUUID();
    const { code, hash } = generateOtpCode();
    const expiresAt = new Date(now.getTime() + REQUEST_EXPIRY_MINUTES * 60 * 1000);

    // No charge here -- the fee is only ever collected when a validator
    // actually confirms the code (see verify), same reasoning as
    // AuthService.requestManualPhoneVerification. feeTokenAmount is
    // snapshotted now so the requester's confirmation copy and the
    // validator's claim stay stable even if the admin reprices later.
    await this.prisma.whatsAppValidationRequest.create({
      data: {
        id: requestId,
        requesterId: userId,
        phoneNumber,
        otpHash: hash,
        feeTokenAmount: integration.feeTokenAmount,
        expiresAt,
      },
    });

    return {
      requestId,
      code,
      feeTokenAmount: integration.feeTokenAmount.toString(),
      expiresAt,
    };
  }

  async myRequests(userId: string) {
    await this.expireStale();
    const rows = await this.prisma.whatsAppValidationRequest.findMany({
      where: { requesterId: userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return rows.map((row) => this.toRequesterPublic(row));
  }

  /**
   * Called when a validator opens the integration page. Requires an active
   * subscription. Idempotently returns an already-held unexpired claim, or
   * atomically claims the oldest unclaimed PENDING request from the pool --
   * the updateMany-with-status-guard idiom used throughout p2p.service.ts
   * and AuthService's manual-verification flow, so two validators racing
   * to open the page at the same moment never both claim the same request.
   */
  async claimNext(validatorUserId: string) {
    const isSubscribed = await this.integrations.isSubscribed(validatorUserId, INTEGRATION_SLUG);
    if (!isSubscribed) {
      throw new ForbiddenException('Subscribe to WhatsApp Validator before claiming requests');
    }

    const now = new Date();
    await this.expireStale(now);
    await this.releaseStaleClaims(now);

    const existingClaim = await this.prisma.whatsAppValidationRequest.findFirst({
      where: {
        claimedByValidatorId: validatorUserId,
        status: WhatsAppValidationRequestStatus.CLAIMED,
        claimExpiresAt: { gt: now },
      },
    });
    if (existingClaim) {
      return this.toValidatorPublic(existingClaim);
    }

    const claimExpiresAt = new Date(now.getTime() + CLAIM_TTL_MINUTES * 60 * 1000);
    // Oldest-first, excludes the validator's own requests (can't verify your own number).
    const candidate = await this.prisma.whatsAppValidationRequest.findFirst({
      where: {
        status: WhatsAppValidationRequestStatus.PENDING,
        requesterId: { not: validatorUserId },
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: 'asc' },
    });
    if (!candidate) {
      throw new NotFoundException('NO_REQUESTS_AVAILABLE');
    }

    const claim = await this.prisma.whatsAppValidationRequest.updateMany({
      where: { id: candidate.id, status: WhatsAppValidationRequestStatus.PENDING },
      data: {
        status: WhatsAppValidationRequestStatus.CLAIMED,
        claimedByValidatorId: validatorUserId,
        claimedAt: now,
        claimExpiresAt,
      },
    });
    if (claim.count === 0) {
      // Lost the race to another validator -- caller can simply retry.
      throw new NotFoundException('NO_REQUESTS_AVAILABLE');
    }

    const claimed = await this.prisma.whatsAppValidationRequest.findUniqueOrThrow({
      where: { id: candidate.id },
    });
    return this.toValidatorPublic(claimed);
  }

  async verify(validatorUserId: string, requestId: string, code: string) {
    await this.expireStale();
    await this.releaseStaleClaims();
    const request = await this.prisma.whatsAppValidationRequest.findUnique({ where: { id: requestId } });
    if (!request) throw new NotFoundException('WhatsApp validation request not found');
    if (request.status !== WhatsAppValidationRequestStatus.CLAIMED) {
      throw new UnprocessableEntityException('This request is no longer claimed');
    }
    if (request.claimedByValidatorId !== validatorUserId) {
      throw new ForbiddenException('You have not claimed this request');
    }
    if (request.expiresAt < new Date()) {
      throw new UnprocessableEntityException('This request has expired');
    }
    if (request.attempts >= request.maxAttempts) {
      throw new UnauthorizedException(
        'Too many incorrect attempts -- reject this request and let another validator try',
      );
    }

    if (hashOtpCode(code) !== request.otpHash) {
      // Same increment-then-reject pattern as OtpService.verify -- a wrong
      // guess is recorded even though the request stays CLAIMED, so
      // repeated wrong codes eventually trip maxAttempts above.
      await this.prisma.whatsAppValidationRequest.updateMany({
        where: { id: requestId, status: WhatsAppValidationRequestStatus.CLAIMED },
        data: { attempts: { increment: 1 } },
      });
      throw new UnauthorizedException('Invalid verification code');
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        // where: { status: CLAIMED } makes this claim atomic -- if a
        // reject or claim-expiry races this call, only one update actually
        // matches, same idiom as completeManualPhoneVerification.
        const claim = await tx.whatsAppValidationRequest.updateMany({
          where: { id: requestId, status: WhatsAppValidationRequestStatus.CLAIMED },
          data: { status: WhatsAppValidationRequestStatus.VERIFIED, verifiedAt: new Date() },
        });
        if (claim.count === 0) {
          throw new UnprocessableEntityException('This request is no longer claimed');
        }

        if (request.feeTokenAmount.gt(0)) {
          const requesterWallet = await tx.wallet.upsert({
            where: { userId: request.requesterId },
            create: { userId: request.requesterId },
            update: {},
          });
          const debited = await tx.wallet.updateMany({
            where: { userId: request.requesterId, balance: { gte: request.feeTokenAmount } },
            data: { balance: { decrement: request.feeTokenAmount } },
          });
          if (debited.count === 0) {
            throw new UnprocessableEntityException(
              `Requester has insufficient DL for the ${request.feeTokenAmount.toString()} DL verification fee`,
            );
          }
          await tx.ledgerEntry.create({
            data: {
              walletId: requesterWallet.id,
              type: LedgerEntryType.WHATSAPP_VALIDATION_FEE,
              amount: request.feeTokenAmount.mul(-1),
              reference: requestId,
            },
          });

          const validatorWallet = await tx.wallet.upsert({
            where: { userId: validatorUserId },
            create: { userId: validatorUserId },
            update: {},
          });
          await tx.wallet.update({
            where: { id: validatorWallet.id },
            data: { balance: { increment: request.feeTokenAmount } },
          });
          await tx.ledgerEntry.create({
            data: {
              walletId: validatorWallet.id,
              type: LedgerEntryType.WHATSAPP_VALIDATION_PAYOUT,
              amount: request.feeTokenAmount,
              reference: requestId,
            },
          });
        }

        await tx.user.update({
          where: { id: request.requesterId },
          data: { phoneNumber: request.phoneNumber, phoneVerifiedAt: new Date() },
        });
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('This phone number is already in use on another account');
      }
      throw err;
    }

    const requester = await this.prisma.user.findUnique({
      where: { id: request.requesterId },
      select: { email: true },
    });
    // Best-effort -- the verification itself already landed above (fee
    // moved, phoneVerifiedAt set); a mail failure must not unwind it.
    if (requester) {
      try {
        await this.mail.sendPhoneVerifiedEmail(requester.email, request.phoneNumber);
      } catch {
        // swallow -- see doc comment above
      }
    }

    const updated = await this.prisma.whatsAppValidationRequest.findUniqueOrThrow({
      where: { id: requestId },
    });
    return this.toValidatorPublic(updated);
  }

  /** Claimant-only. Returns the request to the pool rather than a terminal REJECTED state -- a peer declining isn't necessarily fraud, it might just mean the requester never sent the code, and another validator may still be able to fulfill it before it expires. */
  async reject(validatorUserId: string, requestId: string) {
    const request = await this.prisma.whatsAppValidationRequest.findUnique({ where: { id: requestId } });
    if (!request) throw new NotFoundException('WhatsApp validation request not found');
    if (request.status !== WhatsAppValidationRequestStatus.CLAIMED) {
      throw new UnprocessableEntityException('This request is no longer claimed');
    }
    if (request.claimedByValidatorId !== validatorUserId) {
      throw new ForbiddenException('You have not claimed this request');
    }
    const claim = await this.prisma.whatsAppValidationRequest.updateMany({
      where: { id: requestId, status: WhatsAppValidationRequestStatus.CLAIMED },
      data: {
        status: WhatsAppValidationRequestStatus.PENDING,
        claimedByValidatorId: null,
        claimedAt: null,
        claimExpiresAt: null,
      },
    });
    if (claim.count === 0) {
      throw new UnprocessableEntityException('This request is no longer claimed');
    }
    return { released: true };
  }

  private async expireStale(now = new Date()): Promise<void> {
    // Same reasoning as AuthService.expireManualPhoneVerificationRequests
    // -- an expired, never-completed request never charged the requester,
    // so there's nothing to refund here either.
    await this.prisma.whatsAppValidationRequest.updateMany({
      where: {
        status: { in: [WhatsAppValidationRequestStatus.PENDING, WhatsAppValidationRequestStatus.CLAIMED] },
        expiresAt: { lt: now },
      },
      data: { status: WhatsAppValidationRequestStatus.EXPIRED },
    });
  }

  private async releaseStaleClaims(now = new Date()): Promise<void> {
    await this.prisma.whatsAppValidationRequest.updateMany({
      where: {
        status: WhatsAppValidationRequestStatus.CLAIMED,
        claimExpiresAt: { lt: now },
        expiresAt: { gt: now },
      },
      data: { status: WhatsAppValidationRequestStatus.PENDING, claimedByValidatorId: null, claimedAt: null, claimExpiresAt: null },
    });
  }

  private toRequesterPublic(row: {
    id: string;
    phoneNumber: string;
    status: WhatsAppValidationRequestStatus;
    feeTokenAmount: Prisma.Decimal;
    verifiedAt: Date | null;
    rejectedAt: Date | null;
    expiresAt: Date;
    createdAt: Date;
  }) {
    return {
      id: row.id,
      phoneNumber: row.phoneNumber,
      status: row.status,
      feeTokenAmount: row.feeTokenAmount.toString(),
      verifiedAt: row.verifiedAt,
      rejectedAt: row.rejectedAt,
      expiresAt: row.expiresAt,
      createdAt: row.createdAt,
    };
  }

  private toValidatorPublic(row: {
    id: string;
    phoneNumber: string;
    status: WhatsAppValidationRequestStatus;
    feeTokenAmount: Prisma.Decimal;
    attempts: number;
    maxAttempts: number;
    claimedAt: Date | null;
    claimExpiresAt: Date | null;
    verifiedAt: Date | null;
    createdAt: Date;
  }) {
    return {
      id: row.id,
      phoneNumber: row.phoneNumber,
      status: row.status,
      feeTokenAmount: row.feeTokenAmount.toString(),
      attempts: row.attempts,
      maxAttempts: row.maxAttempts,
      claimedAt: row.claimedAt,
      claimExpiresAt: row.claimExpiresAt,
      verifiedAt: row.verifiedAt,
      createdAt: row.createdAt,
    };
  }
}

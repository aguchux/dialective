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
    const expiresAt = new Date(now.getTime() + integration.codeValidityMinutes * 60 * 1000);

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

  /**
   * Requester-only. The plaintext code is never stored server-side (only
   * its hash), so it's shown exactly once at issue time -- if the
   * requester loses it (closed the tab, reloaded the page) there is no way
   * to recover it, only to replace it. Generates a fresh code/hash for the
   * requester's existing live request and resets attempts. Does NOT touch
   * an existing claim -- a claim is permanent until the validator
   * explicitly releases/skips it or verification succeeds, so a code
   * reset must not silently knock a validator off a request they're
   * already working; they simply need the new code relayed to them.
   */
  async regenerateCode(userId: string) {
    const now = new Date();
    await this.expireStale(now);
    const request = await this.prisma.whatsAppValidationRequest.findFirst({
      where: {
        requesterId: userId,
        status: { in: [WhatsAppValidationRequestStatus.PENDING, WhatsAppValidationRequestStatus.CLAIMED] },
        expiresAt: { gt: now },
      },
    });
    if (!request) {
      throw new NotFoundException('No pending WhatsApp validation request to regenerate');
    }

    const { code, hash } = generateOtpCode();
    const claim = await this.prisma.whatsAppValidationRequest.updateMany({
      where: { id: request.id, status: request.status },
      data: {
        otpHash: hash,
        attempts: 0,
      },
    });
    if (claim.count === 0) {
      // Status moved under us (e.g. a validator just verified the old code
      // a moment ago) -- nothing to regenerate anymore.
      throw new ConflictException('This request is no longer pending');
    }

    return { requestId: request.id, code };
  }

  /**
   * The requester's own single verification request (there's at most one
   * live one at a time, see the pending/claimed check in
   * requestVerification) -- not a history list. Includes the claiming
   * validator's phone number once claimed, so the requester can reach out
   * first instead of only ever waiting to be contacted.
   */
  async myRequest(userId: string) {
    await this.expireStale();
    const row = await this.prisma.whatsAppValidationRequest.findFirst({
      where: { requesterId: userId },
      orderBy: { createdAt: 'desc' },
      include: {
        claimedByValidator: { select: { phoneNumber: true, firstName: true, lastName: true } },
      },
    });
    return row ? this.toRequesterPublic(row) : null;
  }

  /**
   * Data-list view for the "Validate" tab -- every unclaimed PENDING
   * request (excluding the caller's own), oldest first, so a subscribed
   * validator picks which one to work rather than being handed a random
   * one. Requires an active subscription, same gate as claim(). Paginated
   * so the full backlog stays browsable instead of being cut off at a
   * fixed row cap; who may actually claim from this list is governed
   * entirely by claim()'s admin-configurable maxConcurrentClaims check,
   * not by anything here.
   */
  async listPending(validatorUserId: string, page = 1, pageSize = 20) {
    const isSubscribed = await this.integrations.isSubscribed(validatorUserId, INTEGRATION_SLUG);
    if (!isSubscribed) {
      throw new ForbiddenException('Subscribe to WhatsApp Validator before viewing requests');
    }
    const now = new Date();
    await this.expireStale(now);

    const where = {
      status: WhatsAppValidationRequestStatus.PENDING,
      requesterId: { not: validatorUserId },
      expiresAt: { gt: now },
    };
    const [total, rows] = await Promise.all([
      this.prisma.whatsAppValidationRequest.count({ where }),
      this.prisma.whatsAppValidationRequest.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { requester: { select: { firstName: true, lastName: true } } },
      }),
    ]);
    return {
      items: rows.map((row) => this.toValidatorPublic(row)),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  /**
   * The validator's own currently-claimed requests -- lets the "Validate"
   * list view show a code-entry panel for each one this validator has
   * locked, alongside the rest of the (now-filtered-out) pending list. Can
   * be more than one now that Integration.maxConcurrentClaims allows
   * holding several claims at once (see claim()). A claim never expires on
   * its own -- it stays here until the validator verifies, rejects, or the
   * request itself expires (see expireStale); it is never silently
   * dropped mid-flow just because entering/relaying the code took a while.
   */
  async myClaims(validatorUserId: string) {
    await this.expireStale();
    const rows = await this.prisma.whatsAppValidationRequest.findMany({
      where: {
        claimedByValidatorId: validatorUserId,
        status: WhatsAppValidationRequestStatus.CLAIMED,
      },
      orderBy: { claimedAt: 'asc' },
      include: { requester: { select: { firstName: true, lastName: true } } },
    });
    return rows.map((row) => this.toValidatorPublic(row));
  }

  /**
   * Claims a specific request picked from listPending's list (not a random
   * pull) -- atomic updateMany-with-status-guard, same idiom used
   * throughout p2p.service.ts and AuthService's manual-verification flow,
   * so two validators clicking the same row at the same moment don't both
   * win it. Once claimed, a request is locked to that one validator and
   * never reappears in listPending or is claimable by anyone else -- the
   * updateMany's `status: PENDING` guard below is what enforces that (a
   * second claim attempt on the same row always finds status already
   * CLAIMED and matches zero rows).
   *
   * A validator may hold up to Integration.maxConcurrentClaims claims at
   * once (admin-configurable per integration, default set in
   * INTEGRATION_REGISTRY -- see requireEnabled's returned row), not just
   * one -- lets an active validator work through several requests in
   * parallel instead of serializing on finish-or-skip. A claim is
   * permanent once taken -- it is never auto-released on a timer; only
   * verify() succeeding, reject(), or the underlying request itself
   * expiring (see expireStale) ever frees it.
   */
  async claim(validatorUserId: string, requestId: string) {
    const isSubscribed = await this.integrations.isSubscribed(validatorUserId, INTEGRATION_SLUG);
    if (!isSubscribed) {
      throw new ForbiddenException('Subscribe to WhatsApp Validator before claiming requests');
    }
    const integration = await this.integrations.requireEnabled(INTEGRATION_SLUG);

    const now = new Date();
    await this.expireStale(now);

    const openClaimCount = await this.prisma.whatsAppValidationRequest.count({
      where: {
        claimedByValidatorId: validatorUserId,
        status: WhatsAppValidationRequestStatus.CLAIMED,
        id: { not: requestId },
      },
    });
    if (openClaimCount >= integration.maxConcurrentClaims) {
      throw new ConflictException(
        `You already have ${integration.maxConcurrentClaims} open claim(s) -- finish or skip one before claiming another`,
      );
    }

    const claim = await this.prisma.whatsAppValidationRequest.updateMany({
      where: {
        id: requestId,
        status: WhatsAppValidationRequestStatus.PENDING,
        requesterId: { not: validatorUserId },
        expiresAt: { gt: now },
      },
      data: {
        status: WhatsAppValidationRequestStatus.CLAIMED,
        claimedByValidatorId: validatorUserId,
        claimedAt: now,
      },
    });
    if (claim.count === 0) {
      // Either someone else claimed it first, or it expired/vanished --
      // either way, this exact one is no longer available.
      throw new NotFoundException('This request is no longer available');
    }

    const claimed = await this.prisma.whatsAppValidationRequest.findUniqueOrThrow({
      where: { id: requestId },
      include: { requester: { select: { firstName: true, lastName: true } } },
    });

    // Best-effort -- the claim itself already landed above; a mail
    // failure must not unwind it. Lets the requester know to watch for a
    // WhatsApp message instead of only finding out by reopening the app.
    const validator = await this.prisma.user.findUnique({
      where: { id: validatorUserId },
      select: { firstName: true, lastName: true, phoneNumber: true },
    });
    const requesterContact = await this.prisma.user.findUnique({
      where: { id: claimed.requesterId },
      select: { email: true },
    });
    if (requesterContact) {
      const validatorName = [validator?.firstName, validator?.lastName].filter(Boolean).join(' ') || null;
      try {
        await this.mail.sendWhatsAppValidationClaimedEmail(
          requesterContact.email,
          validatorName,
          validator?.phoneNumber ?? null,
        );
      } catch {
        // swallow -- see doc comment above
      }
    }

    return this.toValidatorPublic(claimed);
  }

  async verify(validatorUserId: string, requestId: string, code: string) {
    await this.expireStale();
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
      include: { requester: { select: { firstName: true, lastName: true } } },
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

  private toRequesterPublic(row: {
    id: string;
    phoneNumber: string;
    status: WhatsAppValidationRequestStatus;
    feeTokenAmount: Prisma.Decimal;
    verifiedAt: Date | null;
    rejectedAt: Date | null;
    expiresAt: Date;
    createdAt: Date;
    claimedByValidator?: {
      phoneNumber: string | null;
      firstName: string | null;
      lastName: string | null;
    } | null;
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
      // Only meaningful once CLAIMED/VERIFIED -- lets the requester reach
      // out to the validator first instead of only ever waiting to be
      // contacted, and confirm they're messaging the right person (name +
      // number together) rather than trusting a bare phone number, which
      // is exactly what a phishing/impersonation attempt would also show.
      // Null while PENDING (nothing to show) or if the validator has no
      // phone number on file.
      validatorPhoneNumber: row.claimedByValidator?.phoneNumber ?? null,
      validatorFirstName: row.claimedByValidator?.firstName ?? null,
      validatorLastName: row.claimedByValidator?.lastName ?? null,
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
    requester?: { firstName: string | null; lastName: string | null } | null;
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
      // Shown alongside the phone number so a validator can cross-check
      // "is this really the account I'm about to verify" before/while
      // messaging -- a bare phone number alone gives a scammer room to
      // claim to be someone else's request.
      requesterFirstName: row.requester?.firstName ?? null,
      requesterLastName: row.requester?.lastName ?? null,
    };
  }
}

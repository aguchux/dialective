import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@dialectiva/db';
import { WhatsAppValidatorService } from './whatsapp-validator.service';
import { hashOtpCode } from '../otp/otp.util';

describe('WhatsAppValidatorService', () => {
  const requesterId = 'requester-1';
  const validatorId = 'validator-1';
  const requestId = 'request-1';
  const code = 'A3F9K2';

  const baseRequest = {
    id: requestId,
    requesterId,
    phoneNumber: '+2348012345678',
    otpHash: hashOtpCode(code),
    status: 'CLAIMED' as const,
    feeTokenAmount: new Prisma.Decimal(2),
    attempts: 0,
    maxAttempts: 5,
    claimedByValidatorId: validatorId,
    claimedAt: new Date(),
    claimExpiresAt: new Date(Date.now() + 10 * 60_000),
    verifiedAt: null as Date | null,
    rejectedAt: null as Date | null,
    expiresAt: new Date(Date.now() + 60 * 60_000),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  let prisma: any;
  let mail: any;
  let integrations: any;
  let service: WhatsAppValidatorService;

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: requesterId, phoneVerifiedAt: null, email: 'req@example.com' }),
        update: jest.fn().mockResolvedValue({}),
      },
      whatsAppValidationRequest: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(baseRequest),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ ...baseRequest, status: 'VERIFIED' }),
        create: jest.fn().mockResolvedValue(baseRequest),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        count: jest.fn().mockResolvedValue(0),
      },
      wallet: {
        upsert: jest.fn().mockResolvedValue({ id: 'wallet-1' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({}),
      },
      ledgerEntry: { create: jest.fn() },
      $transaction: jest.fn(async (arg: unknown) =>
        Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: any) => unknown)(prisma),
      ),
    };
    mail = {
      sendPhoneVerifiedEmail: jest.fn().mockResolvedValue(undefined),
      sendWhatsAppValidationClaimedEmail: jest.fn().mockResolvedValue(undefined),
    };
    integrations = {
      requireEnabled: jest.fn().mockResolvedValue({
        feeTokenAmount: new Prisma.Decimal(2),
        maxConcurrentClaims: 5,
        codeValidityMinutes: 1440,
      }),
      isSubscribed: jest.fn().mockResolvedValue(true),
    };
    service = new WhatsAppValidatorService(prisma, mail, integrations);
  });

  describe('requestVerification', () => {
    it('creates a request and returns the plaintext code', async () => {
      const result = await service.requestVerification(requesterId, '+2348012345678');
      expect(result.requestId).toBeDefined();
      expect(result.code).toMatch(/^[A-Z0-9]{6}$/);
      expect(prisma.whatsAppValidationRequest.create).toHaveBeenCalled();
    });

    it('rejects when the integration is disabled', async () => {
      integrations.requireEnabled.mockRejectedValue(new NotFoundException());
      await expect(service.requestVerification(requesterId, '+2348012345678')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('rejects an invalid phone number', async () => {
      await expect(service.requestVerification(requesterId, 'not-a-phone')).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('rejects when the user already has a verified phone', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: requesterId, phoneVerifiedAt: new Date() });
      await expect(service.requestVerification(requesterId, '+2348012345678')).rejects.toThrow(
        ConflictException,
      );
    });

    it('rejects a duplicate pending/claimed request', async () => {
      prisma.whatsAppValidationRequest.findFirst.mockResolvedValue({ id: 'existing' });
      await expect(service.requestVerification(requesterId, '+2348012345678')).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('regenerateCode', () => {
    it('rejects when the requester has no live request', async () => {
      prisma.whatsAppValidationRequest.findFirst.mockResolvedValue(null);
      await expect(service.regenerateCode(requesterId)).rejects.toThrow(NotFoundException);
    });

    it('issues a fresh code and resets attempts for a PENDING request', async () => {
      prisma.whatsAppValidationRequest.findFirst.mockResolvedValue({
        ...baseRequest,
        status: 'PENDING',
        attempts: 3,
        claimedByValidatorId: null,
      });
      const result = await service.regenerateCode(requesterId);
      expect(result.requestId).toBe(requestId);
      expect(result.code).toMatch(/^[A-Z0-9]{6}$/);
      expect(prisma.whatsAppValidationRequest.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: requestId, status: 'PENDING' },
          data: expect.objectContaining({ attempts: 0 }),
        }),
      );
    });

    it('does NOT release an existing CLAIMED request when regenerating -- a claim is permanent until explicitly released', async () => {
      prisma.whatsAppValidationRequest.findFirst.mockResolvedValue({ ...baseRequest, status: 'CLAIMED' });
      await service.regenerateCode(requesterId);
      expect(prisma.whatsAppValidationRequest.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: requestId, status: 'CLAIMED' },
          data: { otpHash: expect.any(String), attempts: 0 },
        }),
      );
    });

    it('generates a different code each time (new hash, not reusing the old one)', async () => {
      prisma.whatsAppValidationRequest.findFirst.mockResolvedValue({
        ...baseRequest,
        status: 'PENDING',
        claimedByValidatorId: null,
      });
      const result = await service.regenerateCode(requesterId);
      const call = prisma.whatsAppValidationRequest.updateMany.mock.calls[0][0];
      expect(call.data.otpHash).not.toBe(baseRequest.otpHash);
      expect(result.code).toBeDefined();
    });

    it('throws if the status changed underneath (e.g. just got verified)', async () => {
      prisma.whatsAppValidationRequest.findFirst.mockResolvedValue({
        ...baseRequest,
        status: 'PENDING',
        claimedByValidatorId: null,
      });
      // First updateMany call is expireStale housekeeping; the second is
      // the actual regenerate attempt, which loses the race (count: 0).
      prisma.whatsAppValidationRequest.updateMany
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 0 });
      await expect(service.regenerateCode(requesterId)).rejects.toThrow(ConflictException);
    });
  });

  describe('myRequest', () => {
    it('returns null when the requester has no request', async () => {
      prisma.whatsAppValidationRequest.findFirst.mockResolvedValue(null);
      const result = await service.myRequest(requesterId);
      expect(result).toBeNull();
    });

    it('includes the claiming validator\'s phone number and name once claimed', async () => {
      prisma.whatsAppValidationRequest.findFirst.mockResolvedValue({
        ...baseRequest,
        claimedByValidator: { phoneNumber: '+15551234567', firstName: 'Ada', lastName: 'Lovelace' },
      });
      const result = await service.myRequest(requesterId);
      expect(result?.validatorPhoneNumber).toBe('+15551234567');
      expect(result?.validatorFirstName).toBe('Ada');
      expect(result?.validatorLastName).toBe('Lovelace');
      // Fetching the validator's name must be part of the same query, not a
      // second lookup -- anti-phishing only works if name and number always
      // arrive together, never one without the other.
      expect(prisma.whatsAppValidationRequest.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          include: { claimedByValidator: { select: { phoneNumber: true, firstName: true, lastName: true } } },
        }),
      );
    });

    it('is null while unclaimed (PENDING)', async () => {
      prisma.whatsAppValidationRequest.findFirst.mockResolvedValue({
        ...baseRequest,
        status: 'PENDING',
        claimedByValidator: null,
      });
      const result = await service.myRequest(requesterId);
      expect(result?.validatorPhoneNumber).toBeNull();
      expect(result?.validatorFirstName).toBeNull();
      expect(result?.validatorLastName).toBeNull();
    });
  });

  describe('listPending', () => {
    it('requires an active subscription', async () => {
      integrations.isSubscribed.mockResolvedValue(false);
      await expect(service.listPending(validatorId)).rejects.toThrow(ForbiddenException);
    });

    it('lists PENDING requests excluding the caller\'s own, including the requester\'s name', async () => {
      prisma.whatsAppValidationRequest.count.mockResolvedValue(1);
      prisma.whatsAppValidationRequest.findMany.mockResolvedValue([
        { ...baseRequest, status: 'PENDING', requester: { firstName: 'Chidi', lastName: 'Okoro' } },
      ]);
      const result = await service.listPending(validatorId);
      expect(prisma.whatsAppValidationRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'PENDING', requesterId: { not: validatorId } }),
          orderBy: { createdAt: 'asc' },
          skip: 0,
          take: 20,
          include: { requester: { select: { firstName: true, lastName: true } } },
        }),
      );
      expect(result.items[0].requesterFirstName).toBe('Chidi');
      expect(result.items[0].requesterLastName).toBe('Okoro');
      expect(result.total).toBe(1);
      expect(result.totalPages).toBe(1);
    });

    it('paginates using page/pageSize', async () => {
      prisma.whatsAppValidationRequest.count.mockResolvedValue(45);
      prisma.whatsAppValidationRequest.findMany.mockResolvedValue([]);
      const result = await service.listPending(validatorId, 2, 20);
      expect(prisma.whatsAppValidationRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 20 }),
      );
      expect(result.page).toBe(2);
      expect(result.totalPages).toBe(3);
    });
  });

  describe('myClaims', () => {
    it('returns every currently-claimed request, including each requester\'s name', async () => {
      prisma.whatsAppValidationRequest.findMany.mockResolvedValue([
        { ...baseRequest, requester: { firstName: 'Chidi', lastName: 'Okoro' } },
        { ...baseRequest, id: 'request-2', requester: { firstName: 'Ada', lastName: 'Lovelace' } },
      ]);
      const result = await service.myClaims(validatorId);
      expect(result).toHaveLength(2);
      expect(result[0].requesterFirstName).toBe('Chidi');
      expect(result[1].requesterFirstName).toBe('Ada');
    });

    it('returns an empty list when nothing is claimed', async () => {
      prisma.whatsAppValidationRequest.findMany.mockResolvedValue([]);
      const result = await service.myClaims(validatorId);
      expect(result).toEqual([]);
    });
  });

  describe('claim', () => {
    it('requires an active subscription', async () => {
      integrations.isSubscribed.mockResolvedValue(false);
      await expect(service.claim(validatorId, requestId)).rejects.toThrow(ForbiddenException);
    });

    it('atomically claims the specified request', async () => {
      prisma.whatsAppValidationRequest.findFirst.mockResolvedValue(null); // no existing claim
      prisma.whatsAppValidationRequest.findUniqueOrThrow.mockResolvedValue({
        ...baseRequest,
        status: 'CLAIMED',
      });
      await service.claim(validatorId, requestId);
      expect(prisma.whatsAppValidationRequest.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: requestId,
            status: 'PENDING',
            requesterId: { not: validatorId },
          }),
          data: expect.objectContaining({ status: 'CLAIMED', claimedByValidatorId: validatorId }),
        }),
      );
    });

    it('emails the requester that their request was claimed', async () => {
      prisma.whatsAppValidationRequest.findFirst.mockResolvedValue(null);
      prisma.whatsAppValidationRequest.findUniqueOrThrow.mockResolvedValue({
        ...baseRequest,
        status: 'CLAIMED',
      });
      await service.claim(validatorId, requestId);
      expect(mail.sendWhatsAppValidationClaimedEmail).toHaveBeenCalledWith(
        'req@example.com',
        null,
        null,
      );
    });

    it('does not let a mail failure unwind a successful claim', async () => {
      prisma.whatsAppValidationRequest.findFirst.mockResolvedValue(null);
      prisma.whatsAppValidationRequest.findUniqueOrThrow.mockResolvedValue({
        ...baseRequest,
        status: 'CLAIMED',
      });
      mail.sendWhatsAppValidationClaimedEmail.mockRejectedValue(new Error('mail down'));
      await expect(service.claim(validatorId, requestId)).resolves.toBeDefined();
    });

    it('throws when someone else already claimed it (lost the race)', async () => {
      prisma.whatsAppValidationRequest.findFirst.mockResolvedValue(null);
      // First two updateMany calls are expireStale/releaseStaleClaims housekeeping;
      // the third is the actual claim attempt, which loses the race (count: 0).
      prisma.whatsAppValidationRequest.updateMany
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 0 });
      await expect(service.claim(validatorId, requestId)).rejects.toThrow(NotFoundException);
    });

    it('rejects claiming once the validator is at Integration.maxConcurrentClaims', async () => {
      integrations.requireEnabled.mockResolvedValue({
        feeTokenAmount: new Prisma.Decimal(2),
        maxConcurrentClaims: 3,
      });
      prisma.whatsAppValidationRequest.count.mockResolvedValue(3);
      await expect(service.claim(validatorId, requestId)).rejects.toThrow(ConflictException);
      expect(prisma.whatsAppValidationRequest.updateMany).not.toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'CLAIMED' }) }),
      );
    });

    it('allows claiming below the configured limit', async () => {
      integrations.requireEnabled.mockResolvedValue({
        feeTokenAmount: new Prisma.Decimal(2),
        maxConcurrentClaims: 3,
      });
      prisma.whatsAppValidationRequest.count.mockResolvedValue(2);
      prisma.whatsAppValidationRequest.findUniqueOrThrow.mockResolvedValue({
        ...baseRequest,
        status: 'CLAIMED',
      });
      await expect(service.claim(validatorId, requestId)).resolves.toBeDefined();
    });

    it('excludes the request being (re-)claimed from its own open-claim count', async () => {
      // Idempotent re-claim of a request this validator already holds must
      // not count against itself.
      integrations.requireEnabled.mockResolvedValue({
        feeTokenAmount: new Prisma.Decimal(2),
        maxConcurrentClaims: 1,
      });
      prisma.whatsAppValidationRequest.count.mockResolvedValue(0);
      prisma.whatsAppValidationRequest.findUniqueOrThrow.mockResolvedValue({
        ...baseRequest,
        status: 'CLAIMED',
      });
      await service.claim(validatorId, requestId);
      expect(prisma.whatsAppValidationRequest.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: { not: requestId } }),
        }),
      );
    });

    it('scopes the claim update with requesterId: { not: caller } so a user can never claim their own request', async () => {
      // Real Postgres never matches this row for a self-claim (requesterId
      // === validatorId), which updateMany surfaces as count: 0 -- same
      // "vanished/unavailable" outcome as losing a claim race, and the
      // correct behavior even if a validator guesses/spoofs their own
      // request's id directly rather than seeing it via listPending
      // (which already excludes it from view).
      prisma.whatsAppValidationRequest.findFirst.mockResolvedValue(null);
      // First two updateMany calls are expireStale/releaseStaleClaims housekeeping;
      // the third is the actual claim attempt, which the DB-level requesterId
      // guard correctly refuses to match (count: 0).
      prisma.whatsAppValidationRequest.updateMany
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 0 });
      await expect(service.claim(requesterId, requestId)).rejects.toThrow(NotFoundException);
      expect(prisma.whatsAppValidationRequest.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: requestId, requesterId: { not: requesterId } }),
        }),
      );
    });
  });

  describe('verify', () => {
    it('rejects when the caller is not the claimant', async () => {
      await expect(service.verify('someone-else', requestId, code)).rejects.toThrow(ForbiddenException);
    });

    it('succeeds even long after the old fixed claim-TTL window would have elapsed -- a claim is permanent, not time-boxed', async () => {
      // Regression guard: verify() used to call releaseStaleClaims() at its
      // own top, which could flip THIS row back to PENDING moments before
      // the status check below it if claimedAt was old enough -- causing a
      // legitimate in-flight verification to spuriously fail with "no
      // longer claimed". A claim must never expire on a timer.
      prisma.whatsAppValidationRequest.findUnique.mockResolvedValue({
        ...baseRequest,
        claimedAt: new Date(Date.now() - 60 * 60_000),
      });
      await expect(service.verify(validatorId, requestId, code)).resolves.toBeDefined();
    });

    it('accepts a lowercase-typed code -- alphanumeric codes are normalized before hashing', async () => {
      await expect(
        service.verify(validatorId, requestId, code.toLowerCase()),
      ).resolves.toBeDefined();
    });

    it('rejects when the request is not CLAIMED', async () => {
      prisma.whatsAppValidationRequest.findUnique.mockResolvedValue({ ...baseRequest, status: 'PENDING' });
      await expect(service.verify(validatorId, requestId, code)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('rejects and increments attempts on a wrong code', async () => {
      await expect(service.verify(validatorId, requestId, '000000')).rejects.toThrow(UnauthorizedException);
      expect(prisma.whatsAppValidationRequest.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { attempts: { increment: 1 } } }),
      );
    });

    it('rejects once max attempts are reached', async () => {
      prisma.whatsAppValidationRequest.findUnique.mockResolvedValue({ ...baseRequest, attempts: 5 });
      await expect(service.verify(validatorId, requestId, code)).rejects.toThrow(UnauthorizedException);
    });

    it('on correct code: debits requester, credits validator, sets phoneVerifiedAt', async () => {
      await service.verify(validatorId, requestId, code);

      expect(prisma.wallet.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: requesterId, balance: { gte: baseRequest.feeTokenAmount } },
          data: { balance: { decrement: baseRequest.feeTokenAmount } },
        }),
      );
      expect(prisma.wallet.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { balance: { increment: baseRequest.feeTokenAmount } } }),
      );
      expect(prisma.ledgerEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ type: 'WHATSAPP_VALIDATION_FEE' }) }),
      );
      expect(prisma.ledgerEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ type: 'WHATSAPP_VALIDATION_PAYOUT' }) }),
      );
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: requesterId },
          data: expect.objectContaining({ phoneNumber: baseRequest.phoneNumber }),
        }),
      );
    });

    it('rolls back when the requester has insufficient balance', async () => {
      prisma.wallet.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.verify(validatorId, requestId, code)).rejects.toThrow(
        UnprocessableEntityException,
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('reject', () => {
    it('returns the request to PENDING, clearing the claim', async () => {
      const result = await service.reject(validatorId, requestId);
      expect(result).toEqual({ released: true });
      expect(prisma.whatsAppValidationRequest.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: requestId, status: 'CLAIMED' },
          data: expect.objectContaining({ status: 'PENDING', claimedByValidatorId: null }),
        }),
      );
    });

    it('rejects when the caller is not the claimant', async () => {
      await expect(service.reject('someone-else', requestId)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('releaseClaim', () => {
    it('returns the requester\'s claimed request to PENDING, clearing the claim', async () => {
      prisma.whatsAppValidationRequest.findFirst.mockResolvedValue({ ...baseRequest, status: 'CLAIMED' });
      const result = await service.releaseClaim(requesterId);
      expect(result).toEqual({ released: true });
      expect(prisma.whatsAppValidationRequest.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: requestId, status: 'CLAIMED' },
          data: expect.objectContaining({ status: 'PENDING', claimedByValidatorId: null }),
        }),
      );
    });

    it('throws when the requester has no claimed request', async () => {
      prisma.whatsAppValidationRequest.findFirst.mockResolvedValue(null);
      await expect(service.releaseClaim(requesterId)).rejects.toThrow(NotFoundException);
    });

    it('throws a conflict if the claim moved under us (e.g. just verified)', async () => {
      prisma.whatsAppValidationRequest.findFirst.mockResolvedValue({ ...baseRequest, status: 'CLAIMED' });
      prisma.whatsAppValidationRequest.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.releaseClaim(requesterId)).rejects.toThrow(ConflictException);
    });
  });

  describe('cancelRequest', () => {
    it('cancels a PENDING request', async () => {
      prisma.whatsAppValidationRequest.findFirst.mockResolvedValue({ ...baseRequest, status: 'PENDING' });
      const result = await service.cancelRequest(requesterId);
      expect(result).toEqual({ cancelled: true });
      expect(prisma.whatsAppValidationRequest.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: requestId, status: 'PENDING' },
          data: expect.objectContaining({ status: 'CANCELLED', claimedByValidatorId: null }),
        }),
      );
    });

    it('cancels a CLAIMED request, clearing the claim', async () => {
      prisma.whatsAppValidationRequest.findFirst.mockResolvedValue({ ...baseRequest, status: 'CLAIMED' });
      const result = await service.cancelRequest(requesterId);
      expect(result).toEqual({ cancelled: true });
      expect(prisma.whatsAppValidationRequest.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: requestId, status: 'CLAIMED' },
          data: expect.objectContaining({ status: 'CANCELLED', claimedByValidatorId: null, claimedAt: null }),
        }),
      );
    });

    it('throws when the requester has no active request', async () => {
      prisma.whatsAppValidationRequest.findFirst.mockResolvedValue(null);
      await expect(service.cancelRequest(requesterId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('listAdmin', () => {
    it('returns a paginated, mapped platform-wide list', async () => {
      prisma.whatsAppValidationRequest.count.mockResolvedValue(1);
      prisma.whatsAppValidationRequest.findMany.mockResolvedValue([
        {
          ...baseRequest,
          requester: { id: requesterId, email: 'req@example.com', firstName: 'Chidi', lastName: 'Okoro' },
          claimedByValidator: { id: validatorId, email: 'val@example.com', firstName: 'Ada', lastName: 'Lovelace' },
        },
      ]);
      const result = await service.listAdmin({ page: 1, pageSize: 20 });
      expect(result.items).toHaveLength(1);
      expect(result.items[0].requester.email).toBe('req@example.com');
      expect(result.items[0].claimedByValidator?.email).toBe('val@example.com');
      expect(result.total).toBe(1);
      expect(result.totalPages).toBe(1);
    });

    it('filters by status when provided', async () => {
      prisma.whatsAppValidationRequest.count.mockResolvedValue(0);
      prisma.whatsAppValidationRequest.findMany.mockResolvedValue([]);
      await service.listAdmin({ page: 1, pageSize: 20, status: 'VERIFIED' as never });
      expect(prisma.whatsAppValidationRequest.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ status: 'VERIFIED' }) }),
      );
    });
  });

  describe('adminVerify', () => {
    it('verifies a CLAIMED request and pays the claimant', async () => {
      const result = await service.adminVerify(requestId, code);
      expect(result.status).toBe('VERIFIED');
      expect(prisma.whatsAppValidationRequest.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: requestId, status: 'CLAIMED' },
          data: expect.objectContaining({ status: 'VERIFIED' }),
        }),
      );
      // Fee still moves to the claimant validator on an admin-assisted verify.
      expect(prisma.wallet.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: validatorId } }));
    });

    it('verifies a PENDING (unclaimed) request without any payout', async () => {
      prisma.whatsAppValidationRequest.findUnique.mockResolvedValue({
        ...baseRequest,
        status: 'PENDING',
        claimedByValidatorId: null,
      });
      const result = await service.adminVerify(requestId, code);
      expect(result.status).toBe('VERIFIED');
      expect(prisma.whatsAppValidationRequest.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: requestId, status: 'PENDING' } }),
      );
      expect(prisma.wallet.upsert).not.toHaveBeenCalled();
    });

    it('rejects an invalid code and increments attempts', async () => {
      await expect(service.adminVerify(requestId, '000000')).rejects.toThrow(UnauthorizedException);
      expect(prisma.whatsAppValidationRequest.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { attempts: { increment: 1 } } }),
      );
    });

    it('rejects a request that is not PENDING or CLAIMED', async () => {
      prisma.whatsAppValidationRequest.findUnique.mockResolvedValue({ ...baseRequest, status: 'VERIFIED' });
      await expect(service.adminVerify(requestId, code)).rejects.toThrow(UnprocessableEntityException);
    });
  });

  describe('adminForceVerify', () => {
    it('force-verifies a CLAIMED request without checking the code, still paying the claimant', async () => {
      const result = await service.adminForceVerify(requestId);
      expect(result.status).toBe('VERIFIED');
      expect(prisma.wallet.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: validatorId } }));
    });

    it('force-verifies a PENDING request with no payout', async () => {
      prisma.whatsAppValidationRequest.findUnique.mockResolvedValue({
        ...baseRequest,
        status: 'PENDING',
        claimedByValidatorId: null,
      });
      await service.adminForceVerify(requestId);
      expect(prisma.wallet.upsert).not.toHaveBeenCalled();
    });

    it('throws when the request has expired', async () => {
      prisma.whatsAppValidationRequest.findUnique.mockResolvedValue({
        ...baseRequest,
        expiresAt: new Date(Date.now() - 1000),
      });
      await expect(service.adminForceVerify(requestId)).rejects.toThrow(UnprocessableEntityException);
    });
  });

  describe('adminReject', () => {
    it('rejects a CLAIMED request to a terminal REJECTED state, clearing the claim', async () => {
      const result = await service.adminReject(requestId);
      expect(prisma.whatsAppValidationRequest.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: requestId, status: 'CLAIMED' },
          data: expect.objectContaining({ status: 'REJECTED', claimedByValidatorId: null }),
        }),
      );
      expect(result).toBeDefined();
    });

    it('rejects a PENDING request too', async () => {
      prisma.whatsAppValidationRequest.findUnique.mockResolvedValue({ ...baseRequest, status: 'PENDING' });
      await service.adminReject(requestId);
      expect(prisma.whatsAppValidationRequest.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: requestId, status: 'PENDING' } }),
      );
    });

    it('throws when the request is already terminal', async () => {
      prisma.whatsAppValidationRequest.findUnique.mockResolvedValue({ ...baseRequest, status: 'VERIFIED' });
      await expect(service.adminReject(requestId)).rejects.toThrow(UnprocessableEntityException);
    });
  });
});

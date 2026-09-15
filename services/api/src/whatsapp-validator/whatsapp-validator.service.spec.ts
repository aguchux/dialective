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
  const code = '123456';

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
      },
      wallet: {
        upsert: jest.fn().mockResolvedValue({ id: 'wallet-1' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({}),
      },
      ledgerEntry: { create: jest.fn() },
      $transaction: jest.fn(async (fn: (tx: any) => unknown) => fn(prisma)),
    };
    mail = { sendPhoneVerifiedEmail: jest.fn().mockResolvedValue(undefined) };
    integrations = {
      requireEnabled: jest.fn().mockResolvedValue({ feeTokenAmount: new Prisma.Decimal(2) }),
      isSubscribed: jest.fn().mockResolvedValue(true),
    };
    service = new WhatsAppValidatorService(prisma, mail, integrations);
  });

  describe('requestVerification', () => {
    it('creates a request and returns the plaintext code', async () => {
      const result = await service.requestVerification(requesterId, '+2348012345678');
      expect(result.requestId).toBeDefined();
      expect(result.code).toMatch(/^\d{6}$/);
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
      expect(result.code).toMatch(/^\d{6}$/);
      expect(prisma.whatsAppValidationRequest.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: requestId, status: 'PENDING' },
          data: expect.objectContaining({ attempts: 0, status: 'PENDING' }),
        }),
      );
    });

    it('releases a CLAIMED request back to the pool when regenerating', async () => {
      prisma.whatsAppValidationRequest.findFirst.mockResolvedValue({ ...baseRequest, status: 'CLAIMED' });
      await service.regenerateCode(requesterId);
      expect(prisma.whatsAppValidationRequest.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: requestId, status: 'CLAIMED' },
          data: expect.objectContaining({
            status: 'PENDING',
            claimedByValidatorId: null,
            claimedAt: null,
            claimExpiresAt: null,
          }),
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

    it('includes the claiming validator\'s phone number once claimed', async () => {
      prisma.whatsAppValidationRequest.findFirst.mockResolvedValue({
        ...baseRequest,
        claimedByValidator: { phoneNumber: '+15551234567' },
      });
      const result = await service.myRequest(requesterId);
      expect(result?.validatorPhoneNumber).toBe('+15551234567');
    });

    it('is null while unclaimed (PENDING)', async () => {
      prisma.whatsAppValidationRequest.findFirst.mockResolvedValue({
        ...baseRequest,
        status: 'PENDING',
        claimedByValidator: null,
      });
      const result = await service.myRequest(requesterId);
      expect(result?.validatorPhoneNumber).toBeNull();
    });
  });

  describe('listPending', () => {
    it('requires an active subscription', async () => {
      integrations.isSubscribed.mockResolvedValue(false);
      await expect(service.listPending(validatorId)).rejects.toThrow(ForbiddenException);
    });

    it('lists PENDING requests excluding the caller\'s own', async () => {
      await service.listPending(validatorId);
      expect(prisma.whatsAppValidationRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'PENDING', requesterId: { not: validatorId } }),
          orderBy: { createdAt: 'asc' },
        }),
      );
    });
  });

  describe('myClaim', () => {
    it('returns the validator\'s currently-claimed request, if any', async () => {
      prisma.whatsAppValidationRequest.findFirst.mockResolvedValue(baseRequest);
      const result = await service.myClaim(validatorId);
      expect(result?.id).toBe(requestId);
    });

    it('returns null when nothing is claimed', async () => {
      prisma.whatsAppValidationRequest.findFirst.mockResolvedValue(null);
      const result = await service.myClaim(validatorId);
      expect(result).toBeNull();
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

    it('rejects claiming a second request while one is already held', async () => {
      prisma.whatsAppValidationRequest.findFirst.mockResolvedValue({ ...baseRequest, id: 'other-request' });
      await expect(service.claim(validatorId, requestId)).rejects.toThrow(ConflictException);
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
});

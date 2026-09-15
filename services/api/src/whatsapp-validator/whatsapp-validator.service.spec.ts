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

  describe('claimNext', () => {
    it('requires an active subscription', async () => {
      integrations.isSubscribed.mockResolvedValue(false);
      await expect(service.claimNext(validatorId)).rejects.toThrow(ForbiddenException);
    });

    it('returns an already-held unexpired claim idempotently, without re-claiming', async () => {
      prisma.whatsAppValidationRequest.findFirst.mockResolvedValueOnce(baseRequest);
      const result = await service.claimNext(validatorId);
      expect(result.id).toBe(requestId);
      // expireStale/releaseStaleClaims always run housekeeping updateManys --
      // what matters is that no *claim* (status: PENDING -> CLAIMED) update fired.
      expect(prisma.whatsAppValidationRequest.updateMany).not.toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'CLAIMED' }) }),
      );
    });

    it('atomically claims the oldest pending request excluding the validator\'s own', async () => {
      prisma.whatsAppValidationRequest.findFirst
        .mockResolvedValueOnce(null) // no existing claim
        .mockResolvedValueOnce({ ...baseRequest, status: 'PENDING', claimedByValidatorId: null });
      prisma.whatsAppValidationRequest.findUniqueOrThrow.mockResolvedValue({
        ...baseRequest,
        status: 'CLAIMED',
      });
      await service.claimNext(validatorId);
      expect(prisma.whatsAppValidationRequest.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'PENDING' }),
          data: expect.objectContaining({ status: 'CLAIMED', claimedByValidatorId: validatorId }),
        }),
      );
    });

    it('throws NO_REQUESTS_AVAILABLE when the pool is empty', async () => {
      prisma.whatsAppValidationRequest.findFirst.mockResolvedValue(null);
      await expect(service.claimNext(validatorId)).rejects.toThrow('NO_REQUESTS_AVAILABLE');
    });

    it('throws NO_REQUESTS_AVAILABLE when it loses the claim race', async () => {
      prisma.whatsAppValidationRequest.findFirst
        .mockResolvedValueOnce(null) // no existing claim
        .mockResolvedValueOnce({ ...baseRequest, status: 'PENDING' }); // candidate found
      // First two updateMany calls are expireStale/releaseStaleClaims housekeeping;
      // the third is the actual claim attempt, which loses the race (count: 0).
      prisma.whatsAppValidationRequest.updateMany
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 0 });
      await expect(service.claimNext(validatorId)).rejects.toThrow('NO_REQUESTS_AVAILABLE');
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

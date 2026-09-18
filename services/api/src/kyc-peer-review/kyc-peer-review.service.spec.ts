import { ForbiddenException, UnprocessableEntityException } from '@nestjs/common';
import {
  KYC_PEER_REVIEW_MAX_REVIEWS,
  KYC_PEER_REVIEW_QUORUM,
  KycPeerReviewService,
} from './kyc-peer-review.service';

/**
 * The rules that make peer review of identity documents safe: who may
 * look, how many verdicts decide, what a tie does, and that a reviewer is
 * never paid twice.
 */
describe('KycPeerReviewService', () => {
  function setup(overrides: Record<string, unknown> = {}) {
    const prisma: any = {
      kycVerification: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      kycPeerReview: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      kycPeerReviewClaim: {
        findFirst: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      kycCaptureEvidence: { findUnique: jest.fn().mockResolvedValue(null) },
      kycEvidenceViewLog: { create: jest.fn().mockResolvedValue({}) },
      integration: { findUnique: jest.fn().mockResolvedValue(null) },
      wallet: {
        upsert: jest.fn().mockResolvedValue({ id: 'wallet-1' }),
        update: jest.fn().mockResolvedValue({}),
      },
      ledgerEntry: { create: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn(async (arg: unknown) =>
        typeof arg === 'function' ? (arg as (tx: unknown) => unknown)(prisma) : arg,
      ),
      ...overrides,
    };
    const integrations: any = {
      isSubscribed: jest.fn().mockResolvedValue(true),
      isCertified: jest.fn().mockResolvedValue(false),
      requireEnabled: jest.fn().mockResolvedValue({ maxConcurrentClaims: 2, enabled: true }),
    };
    const kyc: any = {
      adminApproveSelfHosted: jest.fn().mockResolvedValue({}),
      adminDeclineSelfHosted: jest.fn().mockResolvedValue({}),
    };
    const service = new KycPeerReviewService(
      prisma as never,
      integrations as never,
      kyc as never,
    );
    return { service, prisma, integrations, kyc };
  }

  describe('hashDocumentNumber', () => {
    it('ignores case, spaces and punctuation so an honest read is not failed on formatting', () => {
      const a = KycPeerReviewService.hashDocumentNumber('ab-123 456');
      const b = KycPeerReviewService.hashDocumentNumber('AB123456');
      expect(a).toBe(b);
    });

    it('still distinguishes genuinely different numbers', () => {
      expect(KycPeerReviewService.hashDocumentNumber('AB123456')).not.toBe(
        KycPeerReviewService.hashDocumentNumber('AB123457'),
      );
    });

    it('never returns the number itself', () => {
      const hash = KycPeerReviewService.hashDocumentNumber('AB123456');
      expect(hash).not.toContain('AB123456');
      expect(hash).toHaveLength(64);
    });
  });

  describe('access', () => {
    it('refuses a member whose integration access is not approved', async () => {
      const { service, integrations } = setup();
      integrations.isSubscribed.mockResolvedValue(false);
      await expect(service.listPending('user-1')).rejects.toThrow(ForbiddenException);
    });

    it('refuses to serve a document image without a live claim', async () => {
      const { service } = setup();
      await expect(
        service.getClaimedEvidenceRow('user-1', 'kyc-1', 'ev-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('refuses an evidence id belonging to a different verification', async () => {
      const { service, prisma } = setup();
      prisma.kycPeerReviewClaim.findFirst.mockResolvedValue({ id: 'claim-1' });
      prisma.kycCaptureEvidence.findUnique.mockResolvedValue({
        id: 'ev-1',
        kycVerificationId: 'someone-else',
      });
      await expect(service.getClaimedEvidenceRow('user-1', 'kyc-1', 'ev-1')).rejects.toThrow(
        'Evidence not found',
      );
    });

    it('never lets a member review their own verification', async () => {
      const { service, prisma } = setup();
      prisma.kycVerification.findUnique.mockResolvedValue({
        id: 'kyc-1',
        status: 'IN_REVIEW',
        userId: 'user-1',
        _count: { peerReviews: 0 },
      });
      await expect(service.claim('user-1', 'kyc-1')).rejects.toThrow(ForbiddenException);
    });

    it('refuses a claim on a document another reviewer already holds', async () => {
      const { service, prisma } = setup();
      prisma.kycVerification.findUnique.mockResolvedValue({
        id: 'kyc-1',
        status: 'IN_REVIEW',
        userId: 'other',
        _count: { peerReviews: 0 },
      });
      prisma.kycPeerReviewClaim.count
        .mockResolvedValueOnce(0) // reviewer's own held count
        .mockResolvedValueOnce(1); // held by someone else
      await expect(service.claim('user-1', 'kyc-1')).rejects.toThrow(
        'Another reviewer is looking at this one',
      );
    });

    it('enforces the admin-configured concurrent-claim cap', async () => {
      const { service, prisma } = setup();
      prisma.kycPeerReviewClaim.count.mockResolvedValue(2);
      await expect(service.claim('user-1', 'kyc-1')).rejects.toThrow(
        UnprocessableEntityException,
      );
    });
  });

  describe('tally', () => {
    const review = (verdict: 'APPROVE' | 'DECLINE') => ({ verdict });

    it('is undecided after a single verdict', async () => {
      const { service, prisma } = setup();
      prisma.kycPeerReview.findMany.mockResolvedValue([review('APPROVE')]);
      const result = await service.tally('kyc-1');
      expect(result.readyForAdmin).toBe(false);
      expect(result.needsAnotherReviewer).toBe(true);
      expect(result.recommendation).toBeNull();
    });

    it('reaches the admin on two agreeing approvals', async () => {
      const { service, prisma } = setup();
      prisma.kycPeerReview.findMany.mockResolvedValue([review('APPROVE'), review('APPROVE')]);
      const result = await service.tally('kyc-1');
      expect(result.readyForAdmin).toBe(true);
      expect(result.recommendation).toBe('APPROVE');
      expect(KYC_PEER_REVIEW_QUORUM).toBe(2);
    });

    it('reaches the admin on two agreeing declines', async () => {
      const { service, prisma } = setup();
      prisma.kycPeerReview.findMany.mockResolvedValue([review('DECLINE'), review('DECLINE')]);
      const result = await service.tally('kyc-1');
      expect(result.readyForAdmin).toBe(true);
      expect(result.recommendation).toBe('DECLINE');
    });

    it('polls a third reviewer when the first two disagree', async () => {
      const { service, prisma } = setup();
      prisma.kycPeerReview.findMany.mockResolvedValue([review('APPROVE'), review('DECLINE')]);
      const result = await service.tally('kyc-1');
      expect(result.readyForAdmin).toBe(false);
      expect(result.needsAnotherReviewer).toBe(true);
    });

    it('lets the majority of three settle a split', async () => {
      const { service, prisma } = setup();
      prisma.kycPeerReview.findMany.mockResolvedValue([
        review('APPROVE'),
        review('DECLINE'),
        review('APPROVE'),
      ]);
      const result = await service.tally('kyc-1');
      expect(result.readyForAdmin).toBe(true);
      expect(result.recommendation).toBe('APPROVE');
    });

    it('never asks for more than the maximum number of reviewers', async () => {
      const { service, prisma } = setup();
      prisma.kycPeerReview.findMany.mockResolvedValue(
        Array.from({ length: KYC_PEER_REVIEW_MAX_REVIEWS }, () => review('APPROVE')),
      );
      const result = await service.tally('kyc-1');
      expect(result.needsAnotherReviewer).toBe(false);
    });
  });

  describe('submitReview', () => {
    function claimed() {
      const s = setup();
      s.prisma.kycPeerReviewClaim.findFirst.mockResolvedValue({ id: 'claim-1' });
      s.prisma.kycVerification.findUnique.mockResolvedValue({
        id: 'kyc-1',
        status: 'IN_REVIEW',
        userId: 'other',
        decisionEncryptedJson: null,
      });
      return s;
    }

    it('requires a reason when declining', async () => {
      const { service } = claimed();
      await expect(
        service.submitReview('user-1', 'kyc-1', {
          verdict: 'DECLINE',
          documentNumber: 'AB123456',
        }),
      ).rejects.toThrow('Say why you are declining this document');
    });

    it('stores only a hash of the typed number, never the number', async () => {
      const { service, prisma } = claimed();
      await service.submitReview('user-1', 'kyc-1', {
        verdict: 'APPROVE',
        documentNumber: 'AB123456',
      });
      const created = prisma.kycPeerReview.create.mock.calls[0][0].data;
      expect(created.documentNumberHash).toBe(
        KycPeerReviewService.hashDocumentNumber('AB123456'),
      );
      expect(JSON.stringify(created)).not.toContain('AB123456');
    });

    it('releases the claim once a verdict is in', async () => {
      const { service, prisma } = claimed();
      await service.submitReview('user-1', 'kyc-1', {
        verdict: 'APPROVE',
        documentNumber: 'AB123456',
      });
      expect(prisma.kycPeerReviewClaim.deleteMany).toHaveBeenCalledWith({
        where: { kycVerificationId: 'kyc-1', reviewerId: 'user-1' },
      });
    });

    it('refuses a verdict without a live claim', async () => {
      const { service } = setup();
      await expect(
        service.submitReview('user-1', 'kyc-1', {
          verdict: 'APPROVE',
          documentNumber: 'AB123456',
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('certified reviewers', () => {
    function claimed(certified: boolean) {
      const s = setup();
      s.integrations.isCertified.mockResolvedValue(certified);
      s.prisma.kycPeerReviewClaim.findFirst.mockResolvedValue({ id: 'claim-1' });
      s.prisma.kycVerification.findUnique.mockResolvedValue({
        id: 'kyc-1',
        status: 'IN_REVIEW',
        userId: 'other',
        decisionEncryptedJson: null,
        _count: { peerReviews: 0 },
      });
      return s;
    }

    it('decides the verification outright on approve -- no second peer, no admin', async () => {
      const { service, kyc } = claimed(true);
      const result = await service.submitReview('staff-1', 'kyc-1', {
        verdict: 'APPROVE',
        documentNumber: 'AB123456',
      });
      expect(kyc.adminApproveSelfHosted).toHaveBeenCalledWith('kyc-1');
      expect(result.decidedByCertifiedReviewer).toBe(true);
    });

    it('declines outright too, passing the reason through', async () => {
      const { service, kyc } = claimed(true);
      await service.submitReview('staff-1', 'kyc-1', {
        verdict: 'DECLINE',
        documentNumber: 'AB123456',
        declineReason: 'Name does not match',
      });
      expect(kyc.adminDeclineSelfHosted).toHaveBeenCalledWith('kyc-1', 'Name does not match');
    });

    it('leaves an ordinary peer verdict to the normal quorum', async () => {
      const { service, kyc } = claimed(false);
      const result = await service.submitReview('peer-1', 'kyc-1', {
        verdict: 'APPROVE',
        documentNumber: 'AB123456',
      });
      expect(kyc.adminApproveSelfHosted).not.toHaveBeenCalled();
      expect(kyc.adminDeclineSelfHosted).not.toHaveBeenCalled();
      expect(result.decidedByCertifiedReviewer).toBe(false);
    });

    it('is NOT certified when the subscription is merely approved', async () => {
      const { service, integrations, kyc } = claimed(false);
      integrations.isSubscribed.mockResolvedValue(true);
      await service.submitReview('peer-1', 'kyc-1', {
        verdict: 'APPROVE',
        documentNumber: 'AB123456',
      });
      // Approval alone must never confer the decisive privilege.
      expect(kyc.adminApproveSelfHosted).not.toHaveBeenCalled();
    });

    it('can still take a document that has hit the peer-review cap', async () => {
      const { service, prisma, integrations } = setup();
      integrations.isCertified.mockResolvedValue(true);
      // claim() finishes by returning getForReview(), which reads the
      // user and evidence relations -- so the mock has to carry them.
      prisma.kycVerification.findUnique.mockResolvedValue({
        id: 'kyc-1',
        status: 'IN_REVIEW',
        userId: 'other',
        documentType: 'PASSPORT',
        user: { firstName: 'Ada', lastName: 'Lovelace' },
        captureEvidence: [],
        _count: { peerReviews: KYC_PEER_REVIEW_MAX_REVIEWS },
      });
      prisma.kycPeerReviewClaim.findFirst.mockResolvedValue({
        id: 'claim-1',
        claimExpiresAt: new Date(Date.now() + 60000),
      });
      // A document deadlocked at three split peer verdicts must still be
      // resolvable from the trainer app.
      await expect(service.claim('staff-1', 'kyc-1')).resolves.toBeDefined();
    });

    it('still blocks an ordinary peer at the cap', async () => {
      const { service, prisma } = setup();
      prisma.kycVerification.findUnique.mockResolvedValue({
        id: 'kyc-1',
        status: 'IN_REVIEW',
        userId: 'other',
        _count: { peerReviews: KYC_PEER_REVIEW_MAX_REVIEWS },
      });
      await expect(service.claim('peer-1', 'kyc-1')).rejects.toThrow(
        'already has enough reviews',
      );
    });

    it('never lets a certified reviewer review their own verification', async () => {
      const { service, prisma, integrations } = setup();
      integrations.isCertified.mockResolvedValue(true);
      prisma.kycVerification.findUnique.mockResolvedValue({
        id: 'kyc-1',
        status: 'IN_REVIEW',
        userId: 'staff-1',
        _count: { peerReviews: 0 },
      });
      await expect(service.claim('staff-1', 'kyc-1')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('payReviewers', () => {
    function withFee(fee: number) {
      const s = setup();
      s.prisma.integration.findUnique.mockResolvedValue({
        enabled: true,
        feeTokenAmount: {
          lessThanOrEqualTo: (n: number) => fee <= n,
          toString: () => String(fee),
        },
      });
      return s;
    }

    it('pays nothing when the integration is disabled', async () => {
      const { service, prisma } = setup();
      prisma.integration.findUnique.mockResolvedValue({ enabled: false });
      expect(await service.payReviewers('kyc-1')).toEqual({ paid: 0 });
      expect(prisma.ledgerEntry.create).not.toHaveBeenCalled();
    });

    it('credits each unpaid reviewer once', async () => {
      const { service, prisma } = withFee(1);
      prisma.kycPeerReview.findMany.mockResolvedValue([
        { id: 'r1', reviewerId: 'u1' },
        { id: 'r2', reviewerId: 'u2' },
      ]);
      const result = await service.payReviewers('kyc-1');
      expect(result.paid).toBe(2);
      expect(prisma.ledgerEntry.create).toHaveBeenCalledTimes(2);
    });

    it('does not pay a review whose paidAt was already claimed', async () => {
      const { service, prisma } = withFee(1);
      prisma.kycPeerReview.findMany.mockResolvedValue([{ id: 'r1', reviewerId: 'u1' }]);
      // Another call won the race and stamped paidAt first.
      prisma.kycPeerReview.updateMany.mockResolvedValue({ count: 0 });
      const result = await service.payReviewers('kyc-1');
      expect(result.paid).toBe(0);
      expect(prisma.ledgerEntry.create).not.toHaveBeenCalled();
    });

    it('pays nothing when there are no unpaid reviews', async () => {
      const { service, prisma } = withFee(1);
      prisma.kycPeerReview.findMany.mockResolvedValue([]);
      expect(await service.payReviewers('kyc-1')).toEqual({ paid: 0 });
    });
  });
});

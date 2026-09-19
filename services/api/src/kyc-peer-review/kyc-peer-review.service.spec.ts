import { ForbiddenException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@dialectiva/db';
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
        // The burn's idempotency claim guard.
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
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
    function claimed(certified = false) {
      const s = setup();
      s.integrations.isCertified.mockResolvedValue(certified);
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

    /**
     * Some accepted documents carry no number. The three states are
     * different evidence for the admin who decides: matched, did NOT
     * match (a red flag), and nothing to compare. Collapsing the last
     * into the second would turn an absence into an accusation.
     */
    // Only a CERTIFIED reviewer can approve without a number -- an ordinary
    // peer is required to type one (see the rule's own tests below). The
    // three-state semantics still matter here: this is the path a valid but
    // numberless document takes.
    describe('documents with no number (certified reviewer)', () => {
      it('accepts a review with no document number at all', async () => {
        const { service, prisma } = claimed(true);
        await service.submitReview('user-1', 'kyc-1', { verdict: 'APPROVE' });
        const created = prisma.kycPeerReview.create.mock.calls[0][0].data;
        expect(created.documentNumberHash).toBeNull();
        // null, NOT false -- there was nothing to check.
        expect(created.documentNumberMatched).toBeNull();
      });

      it('treats an empty/whitespace number as no number', async () => {
        const { service, prisma } = claimed(true);
        await service.submitReview('user-1', 'kyc-1', {
          verdict: 'APPROVE',
          documentNumber: '   ',
        });
        const created = prisma.kycPeerReview.create.mock.calls[0][0].data;
        expect(created.documentNumberHash).toBeNull();
        expect(created.documentNumberMatched).toBeNull();
      });

      it('still records false when a number was read and did not match', async () => {
        const { service, prisma } = claimed();
        await service.submitReview('user-1', 'kyc-1', {
          verdict: 'APPROVE',
          documentNumber: 'WRONG-NUMBER',
        });
        const created = prisma.kycPeerReview.create.mock.calls[0][0].data;
        expect(created.documentNumberHash).not.toBeNull();
        expect(created.documentNumberMatched).toBe(false);
      });

      it('still requires a decline reason when there is no number', async () => {
        const { service } = claimed();
        await expect(
          service.submitReview('user-1', 'kyc-1', { verdict: 'DECLINE' }),
        ).rejects.toThrow('Say why you are declining this document');
      });
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

    /**
     * A certified reviewer is the platform's own staff, compensated
     * outside the token economy. Paying them DL would hand the
     * applicant's fee straight back into circulation as payment for work
     * already paid for; burning it makes the fee a genuine sink.
     */
    describe('the fee is burned, not paid', () => {
      function withFee(fee: number, collected = fee) {
        const s = claimed(true);
        s.prisma.integration.findUnique.mockResolvedValue({
          enabled: true,
          feeTokenAmount: new Prisma.Decimal(fee),
        });
        s.prisma.kycVerification.findUnique.mockResolvedValue({
          id: 'kyc-1',
          status: 'IN_REVIEW',
          userId: 'applicant-1',
          decisionEncryptedJson: null,
          _count: { peerReviews: 0 },
          reviewFeeTokenAmount: new Prisma.Decimal(collected),
          reviewFeeShortfall: new Prisma.Decimal(0),
          reviewFeeBurnedAt: null,
        });
        return s;
      }

      it('records the burn against the verification and the ledger', async () => {
        const { service, prisma } = withFee(3);
        await service.submitReview('staff-1', 'kyc-1', {
          verdict: 'APPROVE',
          documentNumber: 'AB123456',
        });
        const burn = prisma.ledgerEntry.create.mock.calls
          .map((c: any[]) => c[0].data)
          .find((d: any) => d.type === 'KYC_REVIEW_FEE_BURN');
        expect(burn).toBeDefined();
        expect(Number(burn.amount)).toBeCloseTo(3);
        expect(burn.reference).toBe('kyc-1');
      });

      it('never credits the certified reviewer', async () => {
        const { service, prisma } = withFee(3);
        await service.submitReview('staff-1', 'kyc-1', {
          verdict: 'APPROVE',
          documentNumber: 'AB123456',
        });
        const payout = prisma.ledgerEntry.create.mock.calls
          .map((c: any[]) => c[0].data)
          .find((d: any) => d.type === 'VALIDATION_REWARD');
        expect(payout).toBeUndefined();
      });

      it('burns on a decline too', async () => {
        const { service, prisma } = withFee(3);
        await service.submitReview('staff-1', 'kyc-1', {
          verdict: 'DECLINE',
          documentNumber: 'AB123456',
          declineReason: 'Name does not match',
        });
        expect(
          prisma.ledgerEntry.create.mock.calls
            .map((c: any[]) => c[0].data)
            .some((d: any) => d.type === 'KYC_REVIEW_FEE_BURN'),
        ).toBe(true);
      });

      it('does not move the applicant balance -- they were debited at submission', async () => {
        const { service, prisma } = withFee(3);
        await service.submitReview('staff-1', 'kyc-1', {
          verdict: 'APPROVE',
          documentNumber: 'AB123456',
        });
        expect(prisma.wallet.update).not.toHaveBeenCalled();
      });

      it('burns nothing when the applicant paid nothing', async () => {
        // Full shortfall: the platform covered the fee, so there is no
        // member DL to destroy.
        const { service, prisma } = withFee(3, 0);
        await service.submitReview('staff-1', 'kyc-1', {
          verdict: 'APPROVE',
          documentNumber: 'AB123456',
        });
        expect(
          prisma.ledgerEntry.create.mock.calls
            .map((c: any[]) => c[0].data)
            .some((d: any) => d.type === 'KYC_REVIEW_FEE_BURN'),
        ).toBe(false);
      });

      it('does not burn twice', async () => {
        const { service, prisma } = withFee(3);
        prisma.kycVerification.findUnique.mockResolvedValue({
          id: 'kyc-1',
          status: 'IN_REVIEW',
          userId: 'applicant-1',
          decisionEncryptedJson: null,
          _count: { peerReviews: 0 },
          reviewFeeTokenAmount: new Prisma.Decimal(3),
          reviewFeeBurnedAt: new Date(),
        });
        await service.submitReview('staff-1', 'kyc-1', {
          verdict: 'APPROVE',
          documentNumber: 'AB123456',
        });
        expect(
          prisma.ledgerEntry.create.mock.calls
            .map((c: any[]) => c[0].data)
            .some((d: any) => d.type === 'KYC_REVIEW_FEE_BURN'),
        ).toBe(false);
      });
    });

    it('requires an ordinary peer to type the number when approving', async () => {
      // Two peers can approve a stranger's identity between them with no
      // admin involved, so the number is the evidence they read the card.
      const { service } = claimed(false);
      await expect(
        service.submitReview('peer-1', 'kyc-1', { verdict: 'APPROVE' }),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('rejects a whitespace-only number from an ordinary peer', async () => {
      const { service } = claimed(false);
      await expect(
        service.submitReview('peer-1', 'kyc-1', { verdict: 'APPROVE', documentNumber: '   ' }),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('lets a certified reviewer approve without a number', async () => {
      // Trained staff are trusted to judge a document without re-keying it,
      // which is also the only route for a valid ID that carries no number.
      const { service, kyc } = claimed(true);
      await service.submitReview('staff-1', 'kyc-1', { verdict: 'APPROVE' });
      expect(kyc.adminApproveSelfHosted).toHaveBeenCalledWith('kyc-1');
    });

    it('never asks for a number on a decline', async () => {
      // "No ID uploaded" or an unreadable scan is exactly the case where
      // there is nothing to type.
      const { service, prisma } = claimed(false);
      await service.submitReview('peer-1', 'kyc-1', {
        verdict: 'DECLINE',
        declineReason: 'No ID uploaded',
      });
      expect(prisma.kycPeerReview.create).toHaveBeenCalled();
    });

    it('does not decide on a single ordinary peer verdict', async () => {
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

  /**
   * Peer consensus applies the verdict itself. These cover the path that
   * replaced the admin queue -- the one place where ordinary members move
   * another member's KycStatus, so the conditions for it firing (and for it
   * NOT firing) are worth pinning down precisely.
   */
  describe('consensus decides without an admin', () => {
    /**
     * A claimed verification where `existing` peer reviews are already on
     * file, so the one being submitted is the Nth.
     */
    function atConsensus(existing: ('APPROVE' | 'DECLINE')[], consensusCount = 2) {
      const s = setup();
      s.integrations.isCertified.mockResolvedValue(false);
      s.prisma.kycPeerReviewClaim.findFirst.mockResolvedValue({ id: 'claim-1' });
      s.prisma.kycVerification.findUnique.mockResolvedValue({
        id: 'kyc-1',
        status: 'IN_REVIEW',
        userId: 'other',
        decisionEncryptedJson: null,
        _count: { peerReviews: existing.length },
      });
      s.prisma.integration.findUnique.mockResolvedValue({ consensusCount });
      // tally() re-reads every review, including the one just written.
      s.prisma.kycPeerReview.findMany.mockResolvedValue(
        existing.map((verdict) => ({ verdict, declineReason: null })),
      );
      return s;
    }

    it('approves the verification once enough peers agree', async () => {
      const { service, kyc } = atConsensus(['APPROVE', 'APPROVE']);
      await service.submitReview('peer-2', 'kyc-1', {
        verdict: 'APPROVE',
        documentNumber: 'AB123456',
      });
      expect(kyc.adminApproveSelfHosted).toHaveBeenCalledWith('kyc-1');
    });

    it('declines once enough peers agree, telling the member why', async () => {
      const s = atConsensus(['DECLINE', 'DECLINE']);
      s.prisma.kycPeerReview.findMany.mockResolvedValue([
        { verdict: 'DECLINE', declineReason: 'No ID uploaded' },
        { verdict: 'DECLINE', declineReason: 'No ID uploaded' },
      ]);
      await s.service.submitReview('peer-2', 'kyc-1', {
        verdict: 'DECLINE',
        declineReason: 'No ID uploaded',
      });
      // Deduplicated: agreeing peers usually pick the same reason, and the
      // applicant should not be told the same thing twice.
      expect(s.kyc.adminDeclineSelfHosted).toHaveBeenCalledWith('kyc-1', 'No ID uploaded');
    });

    it('does not decide while peers are still split', async () => {
      const { service, kyc } = atConsensus(['APPROVE', 'DECLINE']);
      await service.submitReview('peer-2', 'kyc-1', {
        verdict: 'APPROVE',
        documentNumber: 'AB123456',
      });
      expect(kyc.adminApproveSelfHosted).not.toHaveBeenCalled();
      expect(kyc.adminDeclineSelfHosted).not.toHaveBeenCalled();
    });

    it('honours a raised consensus count -- two is no longer enough', async () => {
      const { service, kyc } = atConsensus(['APPROVE', 'APPROVE'], 3);
      await service.submitReview('peer-2', 'kyc-1', {
        verdict: 'APPROVE',
        documentNumber: 'AB123456',
      });
      expect(kyc.adminApproveSelfHosted).not.toHaveBeenCalled();
    });

    it('never decides on a consensus count below 1', async () => {
      // A 0 would approve a document nobody agreed on. The DTO floors this
      // at 1, but the service must not trust that on its own.
      const { service, kyc } = atConsensus([], 0);
      await service.submitReview('peer-1', 'kyc-1', {
        verdict: 'APPROVE',
        documentNumber: 'AB123456',
      });
      expect(kyc.adminApproveSelfHosted).not.toHaveBeenCalled();
    });

    it('pays the reviewers once the decision lands', async () => {
      const { service, prisma } = atConsensus(['APPROVE', 'APPROVE']);
      const paySpy = jest.spyOn(service, 'payReviewers').mockResolvedValue({ paid: 2 });
      await service.submitReview('peer-2', 'kyc-1', {
        verdict: 'APPROVE',
        documentNumber: 'AB123456',
      });
      expect(paySpy).toHaveBeenCalledWith('kyc-1');
      expect(prisma.kycPeerReview.create).toHaveBeenCalled();
    });

    it('leaves the document for an admin when applying the decision fails', async () => {
      const { service, kyc } = atConsensus(['APPROVE', 'APPROVE']);
      kyc.adminApproveSelfHosted.mockRejectedValue(new Error('boom'));
      // The reviewer's own submission must still succeed: they did the work,
      // and their review is already committed.
      await expect(
        service.submitReview('peer-2', 'kyc-1', {
          verdict: 'APPROVE',
          documentNumber: 'AB123456',
        }),
      ).resolves.toBeDefined();
    });

    it('does not re-decide a verification that already left IN_REVIEW', async () => {
      const s = atConsensus(['APPROVE', 'APPROVE']);
      // First read (the claim guard) sees IN_REVIEW; by the time the
      // consensus check re-reads it, a concurrent submit has decided it.
      s.prisma.kycVerification.findUnique
        .mockResolvedValueOnce({
          id: 'kyc-1',
          status: 'IN_REVIEW',
          userId: 'other',
          decisionEncryptedJson: null,
          _count: { peerReviews: 2 },
        })
        .mockResolvedValueOnce({ status: 'APPROVED' });
      await s.service.submitReview('peer-2', 'kyc-1', {
        verdict: 'APPROVE',
        documentNumber: 'AB123456',
      });
      expect(s.kyc.adminApproveSelfHosted).not.toHaveBeenCalled();
    });
  });

  describe('payReviewers', () => {
    function withFee(fee: number, applicantFunded = fee * 10, consensusCount = 2) {
      const s = setup();
      // A real Decimal: payReviewers divides the fee by the consensus count
      // to get each reviewer's share, then compares the total against what
      // the applicant actually paid.
      s.prisma.integration.findUnique.mockResolvedValue({
        enabled: true,
        feeTokenAmount: new Prisma.Decimal(fee),
        consensusCount,
      });
      // The applicant's contribution, charged at submission. Defaults
      // high so the default case mints nothing.
      s.prisma.kycVerification.findUnique.mockResolvedValue({
        reviewFeeTokenAmount: new Prisma.Decimal(applicantFunded),
        reviewFeeShortfall: new Prisma.Decimal(0),
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

    /**
     * The applicant pays the fee ONCE and the deciding reviewers share it.
     * Paying each of them the whole fee is what turned every verification
     * into an issuance event -- the thing charging the applicant was meant
     * to stop.
     */
    it('splits one fee between the reviewers rather than paying each in full', async () => {
      const { service, prisma } = withFee(1, 1);
      prisma.kycPeerReview.findMany.mockResolvedValue([
        { id: 'r1', reviewerId: 'u1' },
        { id: 'r2', reviewerId: 'u2' },
      ]);
      await service.payReviewers('kyc-1');
      const credits = prisma.ledgerEntry.create.mock.calls.map((c: any) =>
        Number(c[0].data.amount),
      );
      expect(credits).toEqual([0.5, 0.5]);
      // The whole point: what went out equals what the applicant put in.
      expect(credits.reduce((a: number, b: number) => a + b, 0)).toBe(1);
    });

    it('sizes the share by the consensus count, not the reviews that landed', async () => {
      // A third peer polled to break a tie must not dock everyone's pay:
      // reviewers could not know their rate before agreeing to review.
      const { service, prisma } = withFee(1, 1, 2);
      prisma.kycPeerReview.findMany.mockResolvedValue([
        { id: 'r1', reviewerId: 'u1' },
        { id: 'r2', reviewerId: 'u2' },
        { id: 'r3', reviewerId: 'u3' },
      ]);
      await service.payReviewers('kyc-1');
      const credits = prisma.ledgerEntry.create.mock.calls.map((c: any) =>
        Number(c[0].data.amount),
      );
      // Still half each -- the tie-breaker's share is the bounded cost of
      // disagreement, not a pay cut for the other two.
      expect(credits).toEqual([0.5, 0.5, 0.5]);
    });

    it('divides by a raised consensus count', async () => {
      const { service, prisma } = withFee(1, 1, 4);
      prisma.kycPeerReview.findMany.mockResolvedValue([
        { id: 'r1', reviewerId: 'u1' },
        { id: 'r2', reviewerId: 'u2' },
      ]);
      await service.payReviewers('kyc-1');
      const credits = prisma.ledgerEntry.create.mock.calls.map((c: any) =>
        Number(c[0].data.amount),
      );
      expect(credits).toEqual([0.25, 0.25]);
    });

    /**
     * The applicant funds their own review, so this path should mint
     * nothing in the normal case. Reviewers are paid in full regardless
     * -- an applicant who could not pay is the platform's problem, never
     * the reviewer's.
     */
    it('never pays a certified reviewer -- their fee is burned instead', async () => {
      const { service, prisma, integrations } = withFee(1);
      prisma.kycPeerReview.findMany.mockResolvedValue([
        { id: 'r1', reviewerId: 'peer-1' },
        { id: 'r2', reviewerId: 'staff-1' },
      ]);
      // staff-1 is certified; peer-1 is not.
      integrations.isCertified.mockImplementation(async (userId: string) => userId === 'staff-1');
      const result = await service.payReviewers('kyc-1');
      // The peer who did real work is still paid; the staff member is not.
      expect(result.paid).toBe(1);
      expect(prisma.ledgerEntry.create).toHaveBeenCalledTimes(1);
    });

    it('pays reviewers in full even when the applicant underfunded the review', async () => {
      // Two reviewers owed 1 each, but the applicant only managed 0.5.
      const { service, prisma } = withFee(1, 0.5);
      prisma.kycPeerReview.findMany.mockResolvedValue([
        { id: 'r1', reviewerId: 'u1' },
        { id: 'r2', reviewerId: 'u2' },
      ]);
      const result = await service.payReviewers('kyc-1');
      expect(result.paid).toBe(2);
      expect(prisma.ledgerEntry.create).toHaveBeenCalledTimes(2);
    });

    it('pays reviewers when the applicant paid nothing at all', async () => {
      // A verification charged before the fee existed, or a full
      // shortfall: reviewFeeTokenAmount is null.
      const { service, prisma } = withFee(1);
      prisma.kycVerification.findUnique.mockResolvedValue(null);
      prisma.kycPeerReview.findMany.mockResolvedValue([{ id: 'r1', reviewerId: 'u1' }]);
      const result = await service.payReviewers('kyc-1');
      expect(result.paid).toBe(1);
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

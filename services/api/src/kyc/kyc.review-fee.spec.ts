import { Prisma } from '@dialectiva/db';
import { KycService } from './kyc.service';

/**
 * The member being verified pays for their own ID Review.
 *
 * This turns peer-review payouts from an issuance event into a
 * circulating payment, so the two things that matter are: the applicant
 * is charged exactly once, and an applicant who cannot pay is never
 * blocked -- KYC is a compliance requirement, and a member who cannot
 * withdraw or trade without it must not be stranded by a thin wallet.
 */
function setup(options: { balance?: number; fee?: number; enabled?: boolean } = {}) {
  const balance = options.balance ?? 100;
  const fee = options.fee ?? 0.05;
  const wallet = { id: 'wallet-1', balance: new Prisma.Decimal(balance) };

  const tx = {
    kycVerification: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn().mockResolvedValue({}),
    },
    wallet: {
      upsert: jest.fn().mockResolvedValue(wallet),
      update: jest.fn().mockResolvedValue({}),
    },
    ledgerEntry: { create: jest.fn().mockResolvedValue({}) },
  };

  const prisma = {
    integration: {
      findUnique: jest.fn().mockResolvedValue({
        enabled: options.enabled ?? true,
        feeTokenAmount: new Prisma.Decimal(fee),
      }),
    },
    kycVerification: {
      findUnique: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: jest.fn(async (cb: (t: unknown) => unknown) => cb(tx)),
  };

  const service = new KycService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  return { service, prisma, tx };
}

describe('KycService.chargeReviewFee', () => {
  it('debits the applicant the full fee when they can afford it', async () => {
    const { service, tx } = setup({ balance: 100, fee: 0.05 });
    await service.chargeReviewFee('kyc-1', 'user-1');

    expect(tx.wallet.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { balance: { decrement: expect.objectContaining({ s: 1 }) } },
      }),
    );
    const entry = tx.ledgerEntry.create.mock.calls[0][0].data;
    expect(entry.type).toBe('KYC_REVIEW_FEE');
    expect(entry.reference).toBe('kyc-1');
    // Debits are negative.
    expect(Number(entry.amount)).toBeCloseTo(-0.05);
    // Nothing was left unfunded.
    const written = tx.kycVerification.update.mock.calls[0][0].data;
    expect(Number(written.reviewFeeTokenAmount)).toBeCloseTo(0.05);
    expect(Number(written.reviewFeeShortfall)).toBe(0);
  });

  it('never blocks KYC when the applicant cannot afford the fee', async () => {
    // Has 0.02, owes 0.05.
    const { service, tx } = setup({ balance: 0.02, fee: 0.05 });
    await service.chargeReviewFee('kyc-1', 'user-1');

    const written = tx.kycVerification.update.mock.calls[0][0].data;
    // Takes what they have, records the rest as the platform's cost.
    expect(Number(written.reviewFeeTokenAmount)).toBeCloseTo(0.02);
    expect(Number(written.reviewFeeShortfall)).toBeCloseTo(0.03);
    expect(Number(tx.ledgerEntry.create.mock.calls[0][0].data.amount)).toBeCloseTo(-0.02);
  });

  it('charges nothing, but still proceeds, on a zero balance', async () => {
    const { service, tx } = setup({ balance: 0, fee: 0.05 });
    await service.chargeReviewFee('kyc-1', 'user-1');

    // No debit and no ledger noise for a member with nothing.
    expect(tx.wallet.update).not.toHaveBeenCalled();
    expect(tx.ledgerEntry.create).not.toHaveBeenCalled();
    const written = tx.kycVerification.update.mock.calls[0][0].data;
    expect(Number(written.reviewFeeTokenAmount)).toBe(0);
    expect(Number(written.reviewFeeShortfall)).toBeCloseTo(0.05);
  });

  it('cannot charge the same verification twice', async () => {
    const { service, prisma, tx } = setup();
    // Another call already stamped reviewFeeChargedAt.
    tx.kycVerification.updateMany.mockResolvedValue({ count: 0 });
    await service.chargeReviewFee('kyc-1', 'user-1');

    expect(tx.wallet.upsert).not.toHaveBeenCalled();
    expect(tx.ledgerEntry.create).not.toHaveBeenCalled();
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('charges nothing when the integration is disabled', async () => {
    const { service, prisma } = setup({ enabled: false });
    await service.chargeReviewFee('kyc-1', 'user-1');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('charges nothing when the fee is zero', async () => {
    const { service, prisma } = setup({ fee: 0 });
    await service.chargeReviewFee('kyc-1', 'user-1');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('swallows a failure rather than failing the verification', async () => {
    const { service, prisma } = setup();
    prisma.$transaction.mockRejectedValue(new Error('db down'));
    // The member already did the work of submitting; billing must not
    // take their verification down with it.
    await expect(service.chargeReviewFee('kyc-1', 'user-1')).resolves.toBeUndefined();
  });
});

describe('KycService.refundReviewFeeIfUnreviewed', () => {
  function refundSetup(verification: Record<string, unknown> | null) {
    const s = setup();
    s.prisma.kycVerification.findUnique.mockResolvedValue(verification);
    return s;
  }

  const charged = {
    userId: 'user-1',
    reviewFeeTokenAmount: new Prisma.Decimal(0.05),
    reviewFeeChargedAt: new Date(),
    reviewFeeRefundedAt: null,
    _count: { peerReviews: 0 },
  };

  it('refunds when nobody reviewed the document', async () => {
    const { service, tx } = refundSetup(charged);
    await service.refundReviewFeeIfUnreviewed('kyc-1');

    const entry = tx.ledgerEntry.create.mock.calls[0][0].data;
    expect(entry.type).toBe('KYC_REVIEW_FEE_REFUND');
    expect(Number(entry.amount)).toBeCloseTo(0.05);
    expect(tx.wallet.update).toHaveBeenCalled();
  });

  it('does NOT refund once a reviewer has done the work', async () => {
    const { service, tx } = refundSetup({ ...charged, _count: { peerReviews: 2 } });
    await service.refundReviewFeeIfUnreviewed('kyc-1');
    expect(tx.ledgerEntry.create).not.toHaveBeenCalled();
  });

  it('does not refund twice', async () => {
    const { service, tx } = refundSetup({ ...charged, reviewFeeRefundedAt: new Date() });
    await service.refundReviewFeeIfUnreviewed('kyc-1');
    expect(tx.ledgerEntry.create).not.toHaveBeenCalled();
  });

  it('does not refund a verification that was never charged', async () => {
    const { service, tx } = refundSetup({ ...charged, reviewFeeChargedAt: null });
    await service.refundReviewFeeIfUnreviewed('kyc-1');
    expect(tx.ledgerEntry.create).not.toHaveBeenCalled();
  });

  it('closes out a full-shortfall verification without crediting anything', async () => {
    // The platform covered the whole fee, so there is nothing of the
    // member's to give back.
    const { service, prisma, tx } = refundSetup({
      ...charged,
      reviewFeeTokenAmount: new Prisma.Decimal(0),
    });
    await service.refundReviewFeeIfUnreviewed('kyc-1');
    expect(tx.ledgerEntry.create).not.toHaveBeenCalled();
    // Marked refunded so this row is not re-examined forever.
    expect(prisma.kycVerification.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { reviewFeeRefundedAt: expect.any(Date) } }),
    );
  });

  it('loses the race gracefully when another call refunded first', async () => {
    const { service, tx } = refundSetup(charged);
    tx.kycVerification.updateMany.mockResolvedValue({ count: 0 });
    await service.refundReviewFeeIfUnreviewed('kyc-1');
    expect(tx.ledgerEntry.create).not.toHaveBeenCalled();
  });
});

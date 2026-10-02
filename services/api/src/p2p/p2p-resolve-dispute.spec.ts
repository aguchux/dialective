import { P2PService } from './p2p.service';

/**
 * Resolving a dispute whose trade has already settled.
 *
 * Both escrow helpers (refundTradeToSeller / releaseTradeToBuyer) return
 * silently when the trade is already CANCELLED, RELEASED or EXPIRED -- and
 * those helpers are also what close the dispute row. So against a settled
 * trade the whole resolution did nothing and still answered 200: the admin
 * pressed "Refund seller", saw success, and the dispute stayed in the queue
 * with no way to ever clear it.
 *
 * This is not hypothetical. In production, trade eddb3594 was cancelled and
 * its escrow refunded at 12:51:24.587, and its dispute row was created at
 * 12:51:24.597 -- ten milliseconds later, by a dispute racing the cancel.
 * That dispute could never be resolved by any button in the admin UI.
 */
describe('P2PService.resolveDispute against an already-settled trade', () => {
  const decimal = (value: number) => ({ toString: () => String(value) });

  function build(tradeStatus: string) {
    const dispute = {
      id: 'dispute-1',
      tradeId: 'trade-1',
      status: 'OPEN',
      trade: { id: 'trade-1', status: tradeStatus, tokenAmount: decimal(10) },
    };
    // findUnique is called twice: once for the guard, once to return the
    // resolved row. The second reflects the updateMany the service ran.
    let closedTo: string | null = null;
    const prisma = {
      p2PDispute: {
        findUnique: jest.fn(() =>
          Promise.resolve(
            closedTo ? { ...dispute, status: closedTo, trade: dispute.trade } : dispute,
          ),
        ),
        updateMany: jest.fn((args: { data: { status: string } }) => {
          closedTo = args.data.status;
          return Promise.resolve({ count: 1 });
        }),
      },
      p2PTokenTrade: { findUnique: jest.fn().mockResolvedValue(dispute.trade) },
    };
    const service = new P2PService(
      prisma as never,
      { verify: jest.fn() } as never,
      {} as never,
      { send: jest.fn() } as never,
      {} as never,
    );
    return { service, prisma };
  }

  it('closes the dispute when the escrow already went back to the seller', async () => {
    const { service, prisma } = build('CANCELLED');

    const result = await service.resolveDispute('admin-1', 'dispute-1', {
      winner: 'seller',
      resolutionNote: 'Buyer never paid',
    } as never);

    expect(prisma.p2PDispute.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        // Claimed out of OPEN, so two admins resolving at once cannot both
        // write -- the same discipline the escrow paths use.
        where: { id: 'dispute-1', status: 'OPEN' },
        data: expect.objectContaining({
          status: 'RESOLVED_SELLER',
          resolvedByAdminId: 'admin-1',
        }),
      }),
    );
    expect(result?.status).toBe('RESOLVED_SELLER');
  });

  it('records that no tokens moved, so the note does not imply a second payout', async () => {
    const { service, prisma } = build('CANCELLED');

    await service.resolveDispute('admin-1', 'dispute-1', {
      winner: 'seller',
      resolutionNote: 'Buyer never paid',
    } as never);

    const { data } = (prisma.p2PDispute.updateMany.mock.calls[0] as unknown[])[0] as {
      data: { resolutionNote: string };
    };
    expect(data.resolutionNote).toContain('Buyer never paid');
    expect(data.resolutionNote).toContain('no tokens moved');
  });

  it('closes to the buyer when the escrow already went to the buyer', async () => {
    const { service, prisma } = build('RELEASED');

    await service.resolveDispute('admin-1', 'dispute-1', { winner: 'buyer' } as never);

    expect(prisma.p2PDispute.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'RESOLVED_BUYER' }) }),
    );
  });

  it('refuses to resolve against the direction the escrow already went', async () => {
    // Escrow is back with the seller; "release to buyer" would be a payout
    // that cannot happen, so it must say so rather than close the dispute
    // with a note claiming the buyer won.
    const { service, prisma } = build('CANCELLED');

    await expect(
      service.resolveDispute('admin-1', 'dispute-1', { winner: 'buyer' } as never),
    ).rejects.toThrow(/already cancelled and its tokens returned to the seller/);
    expect(prisma.p2PDispute.updateMany).not.toHaveBeenCalled();
  });

  it('refuses a refund against a trade already released to the buyer', async () => {
    const { service, prisma } = build('RELEASED');

    await expect(
      service.resolveDispute('admin-1', 'dispute-1', { winner: 'seller' } as never),
    ).rejects.toThrow(/already released to the buyer/);
    expect(prisma.p2PDispute.updateMany).not.toHaveBeenCalled();
  });

  it('fails loudly rather than answering 200 with a dispute still open', async () => {
    const { service, prisma } = build('CANCELLED');
    // The claim loses to a concurrent admin: nothing is written, and the
    // re-read still shows OPEN. Reporting success here is what made the
    // button look broken in the first place.
    prisma.p2PDispute.updateMany.mockResolvedValue({ count: 0 });
    prisma.p2PDispute.findUnique.mockResolvedValue({
      id: 'dispute-1',
      status: 'OPEN',
      trade: { id: 'trade-1', status: 'CANCELLED', tokenAmount: decimal(10) },
    } as never);

    await expect(
      service.resolveDispute('admin-1', 'dispute-1', { winner: 'seller' } as never),
    ).rejects.toThrow(/Could not resolve this dispute/);
  });
});

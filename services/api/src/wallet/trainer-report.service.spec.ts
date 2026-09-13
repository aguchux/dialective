import { TrainerReportService } from './trainer-report.service';

describe('TrainerReportService', () => {
  let prisma: any;
  let service: TrainerReportService;

  beforeEach(() => {
    prisma = {
      wallet: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'wallet-1',
          balance: { toNumber: () => 0 },
          lockedBalance: { toNumber: () => 0 },
        }),
      },
      ledgerEntry: {
        groupBy: jest.fn().mockResolvedValue([]),
        findMany: jest.fn().mockResolvedValue([]),
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: null } }),
      },
      wordRecording: { findMany: jest.fn().mockResolvedValue([]) },
      user: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ createdAt: new Date('2026-01-01T00:00:00Z') }),
      },
    };
    service = new TrainerReportService(prisma as never);
  });

  it('resolves the trainer\'s own createdAt as the floor when no from is given', async () => {
    const report = await service.buildReport('user-1');

    expect(prisma.user.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      select: { createdAt: true },
    });
    expect(report.from).toBe('2026-01-01T00:00:00.000Z');
  });

  it('passes an explicit from/to straight into every createdAt filter', async () => {
    const from = new Date('2026-08-01T00:00:00Z');
    const to = new Date('2026-08-07T23:59:59Z');

    await service.buildReport('user-1', from, to);

    expect(prisma.user.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(prisma.wordRecording.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1', createdAt: { gte: from, lte: to } } }),
    );
    expect(prisma.ledgerEntry.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ walletId: 'wallet-1', createdAt: { gte: from, lte: to } }),
      }),
    );
  });

  it('pre-seeds every day in range with zero recordings/earnings even when nothing happened', async () => {
    const from = new Date('2026-08-01T00:00:00Z');
    const to = new Date('2026-08-03T00:00:00Z');

    const report = await service.buildReport('user-1', from, to);

    expect(report.daily.map((day) => day.date)).toEqual(['2026-08-01', '2026-08-02', '2026-08-03']);
    expect(report.daily.every((day) => day.recordings === 0 && day.earningsTokens === '0')).toBe(true);
  });

  it('aggregates recordings, average score, and earnings across wordRecordings/ledger', async () => {
    const from = new Date('2026-08-01T00:00:00Z');
    const to = new Date('2026-08-01T23:59:59Z');
    prisma.wordRecording.findMany.mockResolvedValue([
      { score: 80, compositeScore: 78, createdAt: new Date('2026-08-01T10:00:00Z') },
      { score: null, compositeScore: null, createdAt: new Date('2026-08-01T11:00:00Z') },
      { score: 90, compositeScore: 88, createdAt: new Date('2026-08-01T12:00:00Z') },
    ]);
    prisma.ledgerEntry.groupBy.mockResolvedValue([
      { type: 'TRAINING_PAYOUT', _sum: { amount: 5 }, _count: { _all: 1 } },
      { type: 'REFERRAL_COMMISSION', _sum: { amount: 1 }, _count: { _all: 1 } },
    ]);
    prisma.ledgerEntry.findMany.mockResolvedValue([
      { amount: 5, createdAt: new Date('2026-08-01T10:00:00Z') },
      { amount: 1, createdAt: new Date('2026-08-01T12:00:00Z') },
    ]);

    const report = await service.buildReport('user-1', from, to);

    expect(report.totals).toEqual({
      recordings: 3,
      scoredRecordings: 2,
      avgScore: '85.00',
      avgCompositeScore: '83.00',
      trainingEarningsTokens: '5',
      referralEarningsTokens: '1',
      totalEarningsTokens: '6',
      totalTokensSinceJoin: '0',
      otherCreditsTokens: '0',
      availableBalanceTokens: '0',
      heldBalanceTokens: '0',
      totalWithdrawnTokens: '0',
    });
    expect(report.daily).toEqual([{ date: '2026-08-01', recordings: 3, earningsTokens: '6' }]);
  });

  it('surfaces lifetime balance/withdrawal figures independent of the report date range', async () => {
    prisma.wallet.findUnique.mockResolvedValue({
      id: 'wallet-1',
      balance: { toNumber: () => 42 },
      lockedBalance: { toNumber: () => 8 },
    });
    prisma.ledgerEntry.aggregate
      .mockResolvedValueOnce({ _sum: { amount: 500 } }) // lifetime credits
      .mockResolvedValueOnce({ _sum: { amount: 25 } }) // other credits (external top-ups)
      .mockResolvedValueOnce({ _sum: { amount: -120 } }); // withdrawal + reversal net

    const report = await service.buildReport(
      'user-1',
      new Date('2026-08-01T00:00:00Z'),
      new Date('2026-08-01T23:59:59Z'),
    );

    expect(report.totals.totalTokensSinceJoin).toBe('500');
    expect(report.totals.otherCreditsTokens).toBe('25');
    expect(report.totals.availableBalanceTokens).toBe('42');
    expect(report.totals.heldBalanceTokens).toBe('8');
    expect(report.totals.totalWithdrawnTokens).toBe('120');
  });

  it('scopes "tokens since join" to genuine earning types, not every positive ledger entry', async () => {
    // Regression test: this aggregate used to filter on amount > 0, which
    // also matched TASK_REFUND/WITHDRAWAL_REVERSED -- refunds/reversals of
    // the trainer's own prior debit, not new earnings -- inflating the
    // total well past what the trainer actually earned.
    await service.buildReport(
      'user-1',
      new Date('2026-08-01T00:00:00Z'),
      new Date('2026-08-01T23:59:59Z'),
    );

    expect(prisma.ledgerEntry.aggregate).toHaveBeenNthCalledWith(1, {
      where: {
        walletId: 'wallet-1',
        type: {
          in: [
            'TRAINING_PAYOUT',
            'COURSE_COMPLETION_REWARD',
            'REFERRAL_COMMISSION',
            'REFERRAL_FUNDING_BONUS',
            'REFERRAL_PAYOUT_BONUS',
            'STARTUP_BONUS',
            'TESTIMONY_APPROVED_REWARD',
            'VALIDATION_REWARD',
          ],
        },
      },
      _sum: { amount: true },
    });
  });

  it('nets a fully-reversed withdrawal back to zero rather than going negative', async () => {
    prisma.ledgerEntry.aggregate
      .mockResolvedValueOnce({ _sum: { amount: 0 } })
      .mockResolvedValueOnce({ _sum: { amount: 0 } })
      .mockResolvedValueOnce({ _sum: { amount: 0 } }); // WITHDRAWAL (-100) + WITHDRAWAL_REVERSED (+100)

    const report = await service.buildReport(
      'user-1',
      new Date('2026-08-01T00:00:00Z'),
      new Date('2026-08-01T23:59:59Z'),
    );

    expect(report.totals.totalWithdrawnTokens).toBe('0');
  });

  it('folds COURSE_COMPLETION_REWARD into training earnings, not a separate bucket', async () => {
    const from = new Date('2026-08-01T00:00:00Z');
    const to = new Date('2026-08-01T23:59:59Z');
    prisma.ledgerEntry.groupBy.mockResolvedValue([
      { type: 'TRAINING_PAYOUT', _sum: { amount: 5 }, _count: { _all: 1 } },
      { type: 'COURSE_COMPLETION_REWARD', _sum: { amount: 2 }, _count: { _all: 1 } },
    ]);

    const report = await service.buildReport('user-1', from, to);

    expect(report.totals.trainingEarningsTokens).toBe('7');
    expect(report.totals.referralEarningsTokens).toBe('0');
    expect(report.totals.totalEarningsTokens).toBe('7');
    expect(prisma.ledgerEntry.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          type: { in: expect.arrayContaining(['COURSE_COMPLETION_REWARD']) },
        }),
      }),
    );
  });

  it('skips the wallet-backed ledger queries entirely when the trainer has no wallet row yet', async () => {
    prisma.wallet.findUnique.mockResolvedValue(null);

    const report = await service.buildReport(
      'user-1',
      new Date('2026-08-01T00:00:00Z'),
      new Date('2026-08-01T23:59:59Z'),
    );

    expect(prisma.ledgerEntry.groupBy).not.toHaveBeenCalled();
    expect(prisma.ledgerEntry.findMany).not.toHaveBeenCalled();
    expect(prisma.ledgerEntry.aggregate).not.toHaveBeenCalled();
    expect(report.totals.trainingEarningsTokens).toBe('0');
    expect(report.totals.availableBalanceTokens).toBe('0');
    expect(report.totals.heldBalanceTokens).toBe('0');
    expect(report.totals.totalWithdrawnTokens).toBe('0');
    expect(report.totals.totalTokensSinceJoin).toBe('0');
    expect(report.totals.otherCreditsTokens).toBe('0');
  });
});

describe('TrainerReportService.buildProofAccountReport', () => {
  it('returns an empty-but-well-formed report when the account has no wallet yet', async () => {
    const prisma = {
      user: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ createdAt: new Date('2026-01-01T00:00:00Z') }),
      },
      wallet: { findUnique: jest.fn().mockResolvedValue(null) },
      ledgerEntry: { aggregate: jest.fn(), groupBy: jest.fn(), findMany: jest.fn() },
      wordRecording: { findMany: jest.fn() },
    };
    const service = new TrainerReportService(prisma as never);

    const report = await service.buildProofAccountReport('user-1');

    expect(prisma.ledgerEntry.aggregate).not.toHaveBeenCalled();
    expect(report.summary).toEqual({
      totalTokensSinceJoin: '0',
      availableBalanceTokens: '0',
      heldBalanceTokens: '0',
      totalWithdrawnTokens: '0',
      totalRecordings: 0,
      scoredRecordings: 0,
      avgScore: null,
    });
    expect(report.ledgerEntries).toEqual([]);
    expect(report.ledgerTotalsByType).toEqual([]);
  });

  it('sums lifetime credits/withdrawals, breaks down every ledger type, and lists every entry oldest-first', async () => {
    const prisma = {
      user: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ createdAt: new Date('2026-01-01T00:00:00Z') }),
      },
      wallet: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'wallet-1',
          balance: { toNumber: () => 15.0097399 },
          lockedBalance: { toNumber: () => 1.8 },
        }),
      },
      ledgerEntry: {
        aggregate: jest
          .fn()
          .mockResolvedValueOnce({ _sum: { amount: 49.4397399 } }) // lifetime credits
          .mockResolvedValueOnce({ _sum: { amount: -10 } }), // withdrawal + reversal net
        groupBy: jest.fn().mockResolvedValue([
          { type: 'TRAINING_PAYOUT', _sum: { amount: 33.0255 }, _count: { _all: 234 } },
          { type: 'WITHDRAWAL', _sum: { amount: -40 }, _count: { _all: 4 } },
          { type: 'WITHDRAWAL_REVERSED', _sum: { amount: 30 }, _count: { _all: 3 } },
        ]),
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'entry-1',
            type: 'STARTUP_BONUS',
            amount: 10,
            reference: 'Welcome bonus',
            createdAt: new Date('2026-01-01T00:00:00Z'),
          },
          {
            id: 'entry-2',
            type: 'TRAINING_PAYOUT',
            amount: 0.5,
            reference: null,
            createdAt: new Date('2026-01-02T00:00:00Z'),
          },
        ]),
      },
      wordRecording: {
        findMany: jest.fn().mockResolvedValue([{ score: 80 }, { score: null }, { score: 90 }]),
      },
    };
    const service = new TrainerReportService(prisma as never);

    const report = await service.buildProofAccountReport('user-1');

    expect(report.summary).toEqual({
      totalTokensSinceJoin: '49.4397399',
      availableBalanceTokens: '15.0097399',
      heldBalanceTokens: '1.8',
      totalWithdrawnTokens: '10',
      totalRecordings: 3,
      scoredRecordings: 2,
      avgScore: '85.00',
    });
    expect(report.ledgerTotalsByType).toEqual([
      { type: 'TRAINING_PAYOUT', totalAmount: '33.0255', count: 234 },
      { type: 'WITHDRAWAL', totalAmount: '-40', count: 4 },
      { type: 'WITHDRAWAL_REVERSED', totalAmount: '30', count: 3 },
    ]);
    expect(report.ledgerEntries).toEqual([
      {
        id: 'entry-1',
        type: 'STARTUP_BONUS',
        amount: '10',
        reference: 'Welcome bonus',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'entry-2',
        type: 'TRAINING_PAYOUT',
        amount: '0.5',
        reference: null,
        createdAt: '2026-01-02T00:00:00.000Z',
      },
    ]);
    expect(prisma.ledgerEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }),
    );
  });
});

describe('TrainerReportService.getTotalTokensSinceJoin', () => {
  it('returns 0 without querying ledgerEntry when the trainer has no wallet row yet', async () => {
    const prisma = {
      wallet: { findUnique: jest.fn().mockResolvedValue(null) },
      ledgerEntry: { aggregate: jest.fn() },
    };
    const service = new TrainerReportService(prisma as never);

    await expect(service.getTotalTokensSinceJoin('user-1')).resolves.toBe(0);
    expect(prisma.ledgerEntry.aggregate).not.toHaveBeenCalled();
  });

  it('sums only LIFETIME_CREDIT_ENTRY_TYPES for the wallet, matching buildReport\'s totalTokensSinceJoin', async () => {
    const prisma = {
      wallet: { findUnique: jest.fn().mockResolvedValue({ id: 'wallet-1' }) },
      ledgerEntry: { aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 49.4397 } }) },
    };
    const service = new TrainerReportService(prisma as never);

    await expect(service.getTotalTokensSinceJoin('user-1')).resolves.toBe(49.4397);
    expect(prisma.ledgerEntry.aggregate).toHaveBeenCalledWith({
      where: {
        walletId: 'wallet-1',
        type: {
          in: expect.arrayContaining([
            'TRAINING_PAYOUT',
            'COURSE_COMPLETION_REWARD',
            'REFERRAL_COMMISSION',
            'REFERRAL_FUNDING_BONUS',
            'REFERRAL_PAYOUT_BONUS',
            'STARTUP_BONUS',
            'TESTIMONY_APPROVED_REWARD',
            'VALIDATION_REWARD',
          ]),
        },
      },
      _sum: { amount: true },
    });
  });
});

describe('TrainerReportService.getOtherCreditsSinceJoin', () => {
  it('returns 0 without querying ledgerEntry when the trainer has no wallet row yet', async () => {
    const prisma = {
      wallet: { findUnique: jest.fn().mockResolvedValue(null) },
      ledgerEntry: { aggregate: jest.fn() },
    };
    const service = new TrainerReportService(prisma as never);

    await expect(service.getOtherCreditsSinceJoin('user-1')).resolves.toBe(0);
    expect(prisma.ledgerEntry.aggregate).not.toHaveBeenCalled();
  });

  it('sums only EXTERNAL_TOPUP_ENTRY_TYPES for the wallet', async () => {
    const prisma = {
      wallet: { findUnique: jest.fn().mockResolvedValue({ id: 'wallet-1' }) },
      ledgerEntry: { aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 25 } }) },
    };
    const service = new TrainerReportService(prisma as never);

    await expect(service.getOtherCreditsSinceJoin('user-1')).resolves.toBe(25);
    expect(prisma.ledgerEntry.aggregate).toHaveBeenCalledWith({
      where: {
        walletId: 'wallet-1',
        type: {
          in: expect.arrayContaining([
            'DEPOSIT',
            'ADMIN_FUNDING',
            'ADMIN_ADJUSTMENT',
            'DISTRIBUTOR_BULK_ALLOCATION',
            'DISTRIBUTOR_FUNDING_BONUS',
            'DISTRIBUTOR_PAYOUT_BONUS',
            'SUB_DISTRIBUTOR_ADJUSTMENT',
          ]),
        },
      },
      _sum: { amount: true },
    });
  });
});

import { TrainerReportService } from './trainer-report.service';

describe('TrainerReportService', () => {
  let prisma: any;
  let service: TrainerReportService;

  beforeEach(() => {
    prisma = {
      wallet: { findUnique: jest.fn().mockResolvedValue({ id: 'wallet-1' }) },
      ledgerEntry: {
        groupBy: jest.fn().mockResolvedValue([]),
        findMany: jest.fn().mockResolvedValue([]),
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
      { type: 'TRAINING_PAYOUT', _sum: { amount: 5 } },
      { type: 'REFERRAL_COMMISSION', _sum: { amount: 1 } },
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
    });
    expect(report.daily).toEqual([{ date: '2026-08-01', recordings: 3, earningsTokens: '6' }]);
  });

  it('folds COURSE_COMPLETION_REWARD into training earnings, not a separate bucket', async () => {
    const from = new Date('2026-08-01T00:00:00Z');
    const to = new Date('2026-08-01T23:59:59Z');
    prisma.ledgerEntry.groupBy.mockResolvedValue([
      { type: 'TRAINING_PAYOUT', _sum: { amount: 5 } },
      { type: 'COURSE_COMPLETION_REWARD', _sum: { amount: 2 } },
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
    expect(report.totals.trainingEarningsTokens).toBe('0');
  });
});

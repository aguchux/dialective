import { renderTrainerReportPdf } from './trainer-report-pdf.util';
import { TrainerReport } from './trainer-report.service';

const SAMPLE_REPORT: TrainerReport = {
  from: '2026-08-01T00:00:00.000Z',
  to: '2026-08-07T00:00:00.000Z',
  totals: {
    recordings: 12,
    scoredRecordings: 10,
    avgScore: '85.50',
    avgCompositeScore: '83.00',
    trainingEarningsTokens: '120',
    referralEarningsTokens: '5',
    totalEarningsTokens: '125',
    totalTokensSinceJoin: '900',
    availableBalanceTokens: '300',
    heldBalanceTokens: '20',
    totalWithdrawnTokens: '580',
  },
  ledgerTotalsByType: [
    { type: 'TRAINING_PAYOUT', totalAmount: '120', count: 8 },
    { type: 'ADMIN_FUNDING', totalAmount: '50', count: 1 },
  ],
  daily: [
    { date: '2026-08-01', recordings: 3, earningsTokens: '30' },
    { date: '2026-08-02', recordings: 9, earningsTokens: '95' },
  ],
};

describe('renderTrainerReportPdf', () => {
  it('produces a non-empty valid PDF buffer', async () => {
    const buffer = await renderTrainerReportPdf(SAMPLE_REPORT, 'Test Trainer');

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(100);
    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it('handles an empty daily array without throwing', async () => {
    const buffer = await renderTrainerReportPdf({ ...SAMPLE_REPORT, daily: [] }, 'Test Trainer');

    expect(buffer.length).toBeGreaterThan(100);
  });

  it('handles an empty ledgerTotalsByType array without throwing', async () => {
    const buffer = await renderTrainerReportPdf(
      { ...SAMPLE_REPORT, ledgerTotalsByType: [] },
      'Test Trainer',
    );

    expect(buffer.length).toBeGreaterThan(100);
  });
});

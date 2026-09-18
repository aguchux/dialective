import { renderProofAccountPdf } from './proof-account-pdf.util';

/**
 * Regression coverage for the statement's fee wording.
 *
 * The statement used to file withdrawals and fees in one bucket and summarise
 * it as "N DL covers fees, corrections, or other spending". On a real account
 * with 66 DL of withdrawals and a single 1 DL fee that rendered as "67 DL
 * covers fees", and the member reasonably concluded the platform had taken
 * 80% of their earnings. These tests pin the two properties that prevent it:
 * a withdrawal is never counted as a fee, and the fee total is always stated
 * outright.
 *
 * Asserting on extracted PDF text is deliberate -- the bug was purely in what
 * the rendered page SAYS, so a test against the intermediate data structures
 * would have stayed green through the whole incident.
 */

// PDFKit subsets its fonts, so text is not recoverable as plain bytes from the
// content streams. Assert against the strings handed to doc.text() instead, by
// recording them as the document is built.
function captureText(): { calls: string[]; restore: () => void } {
  const calls: string[] = [];
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const PDFDocument = require('pdfkit');
  const original = PDFDocument.prototype.text;
  PDFDocument.prototype.text = function patched(this: unknown, ...args: unknown[]) {
    if (typeof args[0] === 'string') calls.push(args[0]);
    return original.apply(this, args as never);
  };
  return { calls, restore: () => (PDFDocument.prototype.text = original) };
}

function reportWith(totals: { type: string; count: number; totalAmount: string }[]): never {
  return {
    accountCreatedAt: '2026-09-03T00:00:00.000Z',
    generatedAt: '2026-09-18T05:47:00.000Z',
    summary: {
      totalTokensSinceJoin: '86.8746',
      availableBalanceTokens: '6.8346',
      heldBalanceTokens: '5.05',
      totalWithdrawnTokens: '12',
    },
    ledgerTotalsByType: totals,
    ledgerEntries: [
      {
        type: 'WITHDRAWAL',
        amount: '-66',
        reference: 'wd-1',
        createdAt: '2026-09-10T01:00:00.000Z',
      },
    ],
  } as never;
}

// The exact shape of the account that prompted the report: 66 DL of
// withdrawals (54 of them reversed) against one 1 DL fee.
const REAL_ACCOUNT_TOTALS = [
  { type: 'TRAINING_PAYOUT', count: 493, totalAmount: '69.8606' },
  { type: 'STARTUP_BONUS', count: 1, totalAmount: '10' },
  { type: 'COURSE_COMPLETION_REWARD', count: 4, totalAmount: '7' },
  { type: 'TASK_LOCK', count: 1278, totalAmount: '-126.33' },
  { type: 'TASK_REFUND', count: 787, totalAmount: '77.29' },
  { type: 'WITHDRAWAL_REVERSED', count: 4, totalAmount: '54' },
  { type: 'P2P_ESCROW_LOCK', count: 1, totalAmount: '-18' },
  { type: 'WITHDRAWAL', count: 5, totalAmount: '-66' },
  { type: 'PHONE_VERIFICATION_FEE', count: 1, totalAmount: '-1' },
];

describe('renderProofAccountPdf fee wording', () => {
  let capture: { calls: string[]; restore: () => void };

  afterEach(() => capture?.restore());

  async function render(totals = REAL_ACCOUNT_TOTALS): Promise<string> {
    capture = captureText();
    await renderProofAccountPdf(reportWith(totals), 'Pius (pius@example.com)');
    return capture.calls.join('\n');
  }

  it('states the fee total as 1 DL, never folding the 66 DL of withdrawals into it', async () => {
    const text = await render();

    expect(text).toContain(
      'Total fees charged by the platform, for the entire life of this account: 1 DL.',
    );
    // The original defect, stated as an assertion: no fee figure may ever
    // reach 67 DL (66 withdrawn + 1 fee) on this account.
    expect(text).not.toMatch(/67 DL/);
    expect(text).not.toMatch(/covers fees, corrections, or other spending/);
  });

  it('labels withdrawals as money paid to the member, not as spending', async () => {
    const text = await render();

    expect(text).toContain('Paid out to you');
    expect(text).toContain('12 DL has already been paid out to you');
    expect(text).not.toContain('Spent or withdrawn');
  });

  it('keeps withdrawals and fees in separate groups', async () => {
    const text = await render();

    expect(text).toContain('Fees charged by the platform');
    // Each group must disclaim fee status in its own hint, so a reader
    // skimming one group cannot mistake it for a charge.
    expect(text).toContain(
      'Your own money, withdrawn to you. These are NOT fees and were not taken by the platform',
    );
  });

  it('files marketplace sales as the member spending, not as a platform fee', async () => {
    const text = await render([
      ...REAL_ACCOUNT_TOTALS,
      { type: 'P2P_ESCROW_RELEASE', count: 2, totalAmount: '-20' },
    ]);

    // 20 DL of tokens sold is real spending but is not a charge, so it must
    // land under "Spent by you" and leave the fee total at 1 DL.
    expect(text).toContain('Spent by you');
    expect(text).toContain('Tokens you sold or sent in a marketplace trade -- not a fee');
    expect(text).toContain(
      'Total fees charged by the platform, for the entire life of this account: 1 DL.',
    );
  });

  it('says so explicitly when the platform charged no fees at all', async () => {
    const text = await render(REAL_ACCOUNT_TOTALS.filter((r) => r.type !== 'PHONE_VERIFICATION_FEE'));

    expect(text).toContain('The platform has charged this account no fees at all.');
    expect(text).toContain('no platform fees at all');
  });

  it('does not count an admin correction as a platform fee', async () => {
    const text = await render([
      ...REAL_ACCOUNT_TOTALS.filter((r) => r.type !== 'PHONE_VERIFICATION_FEE'),
      { type: 'ADMIN_ADJUSTMENT', count: 1, totalAmount: '-5' },
    ]);

    // An ADMIN_ADJUSTMENT can be positive or negative, so it is a correction,
    // not a charge -- the fee total must stay at zero.
    expect(text).toContain('The platform has charged this account no fees at all.');
  });
});

import PDFDocument from 'pdfkit';
import { loadLogoPng } from '../common/brand-assets.util';
import { ProofAccountReport } from './trainer-report.service';

const ACCENT = '#6a18a8';
const MUTED = '#666666';
const INK = '#111111';
const CREDIT = '#0f7a4d';
const DEBIT = '#b7412a';
const PANEL_BG = '#f6f2fa';
const HELD_BG = '#fdf3e3';
const HELD_TEXT = '#8a5a0f';

/**
 * Human label + one-line "what this means" for every LedgerEntryType this
 * report can surface, grouped into three buckets a trainer can act on:
 * EARNED (new value, grows the lifetime total), HELD (temporary, nets to
 * zero once resolved -- the #1 source of "why isn't my balance X" tickets),
 * and SPENT (left the wallet for a reason: a fee, a withdrawal, a
 * correction). Anything not listed falls back to its raw enum name under
 * "Other activity" rather than crashing -- new LedgerEntryTypes added to
 * the schema degrade gracefully instead of silently misclassifying.
 */
type Bucket = 'earned' | 'held' | 'spent' | 'other';

const TYPE_INFO: Record<string, { label: string; bucket: Bucket; note?: string }> = {
  TRAINING_PAYOUT: { label: 'Training payout', bucket: 'earned', note: 'Paid for a scored task' },
  COURSE_COMPLETION_REWARD: { label: 'Course completed', bucket: 'earned' },
  TESTIMONY_APPROVED_REWARD: { label: 'Testimony approved', bucket: 'earned' },
  VALIDATION_REWARD: { label: 'Validator reward', bucket: 'earned' },
  REFERRAL_COMMISSION: { label: 'Referral commission', bucket: 'earned' },
  REFERRAL_FUNDING_BONUS: { label: 'Referral bonus', bucket: 'earned' },
  REFERRAL_PAYOUT_BONUS: { label: 'Referral bonus', bucket: 'earned' },
  STARTUP_BONUS: { label: 'Welcome bonus', bucket: 'earned' },
  DEPOSIT: { label: 'Deposit', bucket: 'earned' },
  ADMIN_FUNDING: { label: 'Admin top-up', bucket: 'earned' },
  DISTRIBUTOR_BULK_ALLOCATION: { label: 'Distributor allocation', bucket: 'earned' },
  DISTRIBUTOR_FUNDING_BONUS: { label: 'Distributor bonus', bucket: 'earned' },
  DISTRIBUTOR_PAYOUT_BONUS: { label: 'Distributor bonus', bucket: 'earned' },
  TASK_LOCK: {
    label: 'Task started (reserved)',
    bucket: 'held',
    note: 'Reserved when you begin a task -- released as a payout or refund once it is reviewed',
  },
  TASK_REFUND: {
    label: 'Task refunded',
    bucket: 'held',
    note: 'A reserved amount returned to your balance -- no tokens were lost',
  },
  TASK_SPEND: { label: 'Task spend (legacy)', bucket: 'spent' },
  P2P_ESCROW_LOCK: { label: 'Marketplace order held', bucket: 'held' },
  P2P_ESCROW_REFUND: { label: 'Marketplace order refunded', bucket: 'held' },
  P2P_ESCROW_RELEASE: { label: 'Marketplace order released', bucket: 'spent' },
  P2P_ESCROW_CREDIT: { label: 'Marketplace order received', bucket: 'earned' },
  WITHDRAWAL: {
    label: 'Withdrawal requested',
    bucket: 'spent',
    note: 'Deducted the moment you request it, not when it is paid out',
  },
  WITHDRAWAL_REVERSED: {
    label: 'Withdrawal reversed',
    bucket: 'held',
    note: 'A requested withdrawal that did not complete -- the amount was returned to you',
  },
  PHONE_VERIFICATION_FEE: { label: 'Phone verification fee', bucket: 'spent' },
  PHONE_VERIFICATION_FEE_REFUND: { label: 'Verification fee refunded', bucket: 'held' },
  ADMIN_ADJUSTMENT: {
    label: 'Admin correction',
    bucket: 'spent',
    note: 'A manual balance correction made by an admin',
  },
  SUB_DISTRIBUTOR_ADJUSTMENT: { label: 'Distributor adjustment', bucket: 'spent' },
};

function typeInfo(type: string): { label: string; bucket: Bucket; note?: string } {
  return TYPE_INFO[type] ?? { label: type.replace(/_/g, ' ').toLowerCase(), bucket: 'other' };
}

function formatTokens(value: string): string {
  const number = Number(value);
  return Number.isFinite(number)
    ? number.toLocaleString('en-US', { maximumFractionDigits: 4 })
    : value;
}

function formatSigned(value: string): string {
  const number = Number(value);
  if (!Number.isFinite(number)) return value;
  const formatted = Math.abs(number).toLocaleString('en-US', { maximumFractionDigits: 4 });
  return number < 0 ? `-${formatted}` : `+${formatted}`;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function ensureSpace(doc: PDFKit.PDFDocument, needed: number) {
  if (doc.y > doc.page.height - doc.page.margins.bottom - needed) doc.addPage();
}

/**
 * Renders a ProofAccountReport as a multi-page PDF built to answer, without
 * a follow-up question, "why is my available balance not the same as my
 * total earned" -- the single most common reason this report gets
 * generated. Structure: account summary tiles, then a one-paragraph plain-
 * English explanation of the gap (with the actual reconciling numbers
 * filled in), then a three-bucket breakdown (Earned / Held / Spent) instead
 * of a flat alphabetical dump of enum names, then the full itemized
 * history for a reader who wants to verify every line themselves.
 */
export function renderProofAccountPdf(
  report: ProofAccountReport,
  accountLabel: string,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

    // --- Header -------------------------------------------------------
    const logo = loadLogoPng();
    const headerTop = doc.y;
    const headerTextX = logo ? doc.page.margins.left + 36 : doc.page.margins.left;
    if (logo) {
      doc.image(logo, doc.page.margins.left, headerTop, { width: 28, height: 28 });
    }
    doc
      .fillColor(ACCENT)
      .fontSize(20)
      .font('Helvetica-Bold')
      .text('Dialect Library', headerTextX, headerTop);
    doc
      .fillColor(INK)
      .fontSize(14)
      .font('Helvetica-Bold')
      .text('Account statement', headerTextX, doc.y, { paragraphGap: 4 });
    doc.y = Math.max(doc.y, headerTop + 28) + 4;
    doc.x = doc.page.margins.left;
    doc
      .fillColor(MUTED)
      .fontSize(10)
      .font('Helvetica')
      .text(`${accountLabel} -- account opened ${formatDate(report.accountCreatedAt)}`);
    doc.text(`Generated ${formatDateTime(report.generatedAt)}`);
    doc.moveDown(1.2);

    // --- Summary tiles --------------------------------------------------
    const stats: [string, string, string?][] = [
      ['Total earned (lifetime)', `${formatTokens(report.summary.totalTokensSinceJoin)} DL`],
      ['Available balance', `${formatTokens(report.summary.availableBalanceTokens)} DL`],
      [
        'Held (in review)',
        `${formatTokens(report.summary.heldBalanceTokens)} DL`,
        'Releases once pending tasks are scored',
      ],
      ['Completed withdrawals', `${formatTokens(report.summary.totalWithdrawnTokens)} DL`],
    ];

    const tileWidth = pageWidth / 2 - 6;
    let tileX = doc.page.margins.left;
    let tileRowTop = doc.y;
    let tileRowH = 0;
    stats.forEach(([label, value, note], i) => {
      const x = tileX;
      doc.rect(x, tileRowTop, tileWidth, 54).fillColor(PANEL_BG).fill();
      doc
        .fillColor(MUTED)
        .fontSize(7.5)
        .font('Helvetica-Bold')
        .text(label.toUpperCase(), x + 10, tileRowTop + 8, { width: tileWidth - 20 });
      doc
        .fillColor(INK)
        .fontSize(15)
        .font('Helvetica-Bold')
        .text(value, x + 10, tileRowTop + 20, { width: tileWidth - 20 });
      if (note) {
        doc
          .fillColor(HELD_TEXT)
          .fontSize(6.5)
          .font('Helvetica')
          .text(note, x + 10, tileRowTop + 38, { width: tileWidth - 20 });
      }
      tileRowH = 54;
      if (i % 2 === 0) {
        tileX = x + tileWidth + 12;
      } else {
        tileX = doc.page.margins.left;
        tileRowTop += tileRowH + 10;
      }
    });
    doc.y = stats.length % 2 === 0 ? tileRowTop : tileRowTop + tileRowH + 10;
    doc.moveDown(1);

    // --- Plain-English reconciliation ----------------------------------
    const earned = Number(report.summary.totalTokensSinceJoin);
    const available = Number(report.summary.availableBalanceTokens);
    const held = Number(report.summary.heldBalanceTokens);
    const withdrawn = Number(report.summary.totalWithdrawnTokens);
    const gap = earned - available;

    doc.rect(doc.page.margins.left, doc.y, pageWidth, 0).fill();
    const explainTop = doc.y;
    doc
      .fillColor(INK)
      .fontSize(11)
      .font('Helvetica-Bold')
      .text('Why "Total earned" and "Available balance" are different numbers', doc.page.margins.left, explainTop, {
        width: pageWidth,
      });
    doc.moveDown(0.4);
    doc
      .fillColor(MUTED)
      .fontSize(9)
      .font('Helvetica')
      .text(
        '"Total earned" only ever adds up -- it is a running lifetime total that never subtracts ' +
          'anything, including tokens that are currently reserved, spent, or withdrawn. ' +
          '"Available balance" is what is actually usable right now, after every one of those ' +
          'events. The two are not meant to match once any tokens have moved.',
        { width: pageWidth, lineGap: 2 },
      );
    doc.moveDown(0.5);

    if (Math.abs(gap) > 0.0001) {
      const parts: string[] = [];
      if (held > 0.0001) {
        parts.push(
          `${formatTokens(String(held))} DL is currently held for tasks awaiting review and will release automatically`,
        );
      }
      if (withdrawn > 0.0001) {
        parts.push(`${formatTokens(String(withdrawn))} DL has already been paid out`);
      }
      const spentTotal = report.ledgerTotalsByType
        .filter((row) => typeInfo(row.type).bucket === 'spent')
        .reduce((sum, row) => sum + Number(row.totalAmount), 0);
      if (Math.abs(spentTotal) > 0.0001) {
        parts.push(`${formatTokens(String(Math.abs(spentTotal)))} DL covers fees, corrections, or other spending`);
      }
      const sentence =
        parts.length > 0
          ? `The ${formatTokens(String(gap))} DL difference on this account breaks down as: ${parts.join('; ')}.`
          : `On this account, the ${formatTokens(String(gap))} DL difference is accounted for in the breakdown below.`;
      doc.fillColor(INK).fontSize(9).font('Helvetica-Bold').text(sentence, { width: pageWidth, lineGap: 2 });
    } else {
      doc
        .fillColor(CREDIT)
        .fontSize(9)
        .font('Helvetica-Bold')
        .text('On this account, both figures currently match.', { width: pageWidth });
    }
    doc.moveDown(1);

    doc
      .strokeColor('#dddddd')
      .moveTo(doc.page.margins.left, doc.y)
      .lineTo(doc.page.width - doc.page.margins.right, doc.y)
      .stroke();
    doc.moveDown(1);

    // --- Grouped breakdown: Earned / Held / Spent -----------------------
    doc
      .fillColor(INK)
      .fontSize(12)
      .font('Helvetica-Bold')
      .text('Balance breakdown, grouped by what happened');
    doc
      .fillColor(MUTED)
      .fontSize(8)
      .font('Helvetica')
      .text(
        'Every entry ever posted to this wallet, grouped into three plain categories instead of raw system names.',
      );
    doc.moveDown(0.6);

    const groupOrder: { bucket: Bucket; title: string; color: string; hint: string }[] = [
      { bucket: 'earned', title: 'Earned', color: CREDIT, hint: 'New value added to the lifetime total' },
      {
        bucket: 'held',
        title: 'Held or refunded (net zero)',
        color: HELD_TEXT,
        hint: 'Temporarily reserved, then returned -- no lasting effect on your balance',
      },
      { bucket: 'spent', title: 'Spent or withdrawn', color: DEBIT, hint: 'Left the wallet for a specific reason' },
      { bucket: 'other', title: 'Other activity', color: MUTED, hint: '' },
    ];

    const tableX = doc.page.margins.left;
    const typeColWidth = pageWidth * 0.4;
    const countColWidth = pageWidth * 0.15;
    const amountColWidth = pageWidth * 0.2;
    const noteColWidth = pageWidth * 0.25;

    for (const group of groupOrder) {
      const rows = report.ledgerTotalsByType.filter((row) => typeInfo(row.type).bucket === group.bucket);
      if (rows.length === 0) continue;

      ensureSpace(doc, 60);
      const groupTotal = rows.reduce((sum, row) => sum + Number(row.totalAmount), 0);

      const titleY = doc.y;
      const titleColWidth = pageWidth - amountColWidth - 10;
      doc
        .fillColor(group.color)
        .fontSize(9.5)
        .font('Helvetica-Bold')
        .text(group.title, tableX, titleY, { width: titleColWidth });
      doc
        .fillColor(group.color)
        .fontSize(9.5)
        .font('Helvetica-Bold')
        .text(formatSigned(String(groupTotal)) + ' DL', tableX + pageWidth - amountColWidth, titleY, {
          width: amountColWidth,
          align: 'right',
        });
      doc.y = Math.max(doc.y, titleY + 12);
      if (group.hint) {
        doc
          .fillColor(MUTED)
          .fontSize(7.5)
          .font('Helvetica-Oblique')
          .text(group.hint, tableX, doc.y, { width: pageWidth });
      }
      doc.moveDown(0.4);

      for (const row of rows) {
        ensureSpace(doc, 30);
        const info = typeInfo(row.type);
        const y = doc.y;
        doc
          .fillColor(INK)
          .fontSize(8.5)
          .font('Helvetica')
          .text(info.label, tableX + 8, y, { width: typeColWidth - 8 });
        doc
          .fillColor(MUTED)
          .fontSize(8.5)
          .text(`${row.count}x`, tableX + typeColWidth, y, { width: countColWidth, align: 'right' });
        doc
          .fillColor(Number(row.totalAmount) < 0 ? DEBIT : CREDIT)
          .fontSize(8.5)
          .font('Helvetica-Bold')
          .text(formatSigned(row.totalAmount) + ' DL', tableX + typeColWidth + countColWidth, y, {
            width: amountColWidth,
            align: 'right',
          });
        let noteBottom = y;
        if (info.note) {
          doc
            .fillColor(MUTED)
            .fontSize(7)
            .font('Helvetica-Oblique')
            .text(info.note, tableX + typeColWidth + countColWidth + amountColWidth, y + 1, {
              width: noteColWidth,
            });
          noteBottom = doc.y;
        }
        // The label/count/amount calls above each restore doc.y to just
        // past their own line; the note call (drawn in a different column,
        // possibly wrapping to 2-3 lines) does NOT feed into that, so
        // doc.y after all four calls understates the row's real height
        // whenever the note wraps. Take the max explicitly so the next
        // section starts below the tallest column, not the shortest.
        doc.y = Math.max(doc.y, y + 11, noteBottom) + 4;
      }
      doc.moveDown(0.4);
    }

    doc.moveDown(0.5);
    doc
      .strokeColor('#dddddd')
      .moveTo(doc.page.margins.left, doc.y)
      .lineTo(doc.page.width - doc.page.margins.right, doc.y)
      .stroke();
    doc.moveDown(1);

    // --- Full transaction history ---------------------------------------
    doc.fillColor(INK).fontSize(12).font('Helvetica-Bold').text('Full transaction history');
    doc
      .fillColor(MUTED)
      .fontSize(8)
      .font('Helvetica')
      .text(
        `Every one of the ${report.ledgerEntries.length.toLocaleString()} ledger entries on this wallet, oldest first -- for verifying any individual line above.`,
      );
    doc.moveDown(0.6);

    const dateColWidth = pageWidth * 0.18;
    const txTypeColWidth = pageWidth * 0.32;
    const txAmountColWidth = pageWidth * 0.2;
    const refColWidth = pageWidth * 0.3 - 10;
    const refColX = tableX + dateColWidth + txTypeColWidth + txAmountColWidth + 10;

    function drawTxHeader() {
      const y = doc.y;
      doc
        .fillColor(MUTED)
        .fontSize(7.5)
        .font('Helvetica-Bold')
        .text('DATE', tableX, y, { width: dateColWidth })
        .text('TYPE', tableX + dateColWidth, y, { width: txTypeColWidth })
        .text('AMOUNT (DL)', tableX + dateColWidth + txTypeColWidth, y, {
          width: txAmountColWidth,
          align: 'right',
        })
        .text('REFERENCE', refColX, y, { width: refColWidth });
      doc.moveDown(0.5);
      doc
        .strokeColor('#eeeeee')
        .moveTo(tableX, doc.y)
        .lineTo(tableX + pageWidth, doc.y)
        .stroke();
      doc.moveDown(0.3);
    }

    drawTxHeader();
    for (const entry of report.ledgerEntries) {
      if (doc.y > doc.page.height - doc.page.margins.bottom - 20) {
        doc.addPage();
        drawTxHeader();
      }
      const info = typeInfo(entry.type);
      const y = doc.y;
      doc
        .fillColor(MUTED)
        .fontSize(7.5)
        .font('Helvetica')
        .text(formatDate(entry.createdAt), tableX, y, { width: dateColWidth });
      doc
        .fillColor(INK)
        .fontSize(7.5)
        .font('Helvetica')
        .text(info.label, tableX + dateColWidth, y, { width: txTypeColWidth });
      doc
        .fillColor(Number(entry.amount) < 0 ? DEBIT : CREDIT)
        .fontSize(7.5)
        .font('Helvetica-Bold')
        .text(formatSigned(entry.amount) + ' DL', tableX + dateColWidth + txTypeColWidth, y, {
          width: txAmountColWidth,
          align: 'right',
        });
      doc
        .fillColor(MUTED)
        .fontSize(7)
        .font('Helvetica')
        .text(entry.reference ?? '-', refColX, y, { width: refColWidth });
      doc.moveDown(0.42);
    }

    doc.moveDown(1.2);
    doc
      .fillColor(MUTED)
      .fontSize(8)
      .font('Helvetica')
      .text('Generated by Dialect Library. Questions about this statement? Contact hello@dialectlibrary.com.');

    doc.end();
  });
}

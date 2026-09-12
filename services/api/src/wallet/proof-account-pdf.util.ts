import PDFDocument from 'pdfkit';
import { ProofAccountReport } from './trainer-report.service';

const ACCENT = '#6a18a8';
const MUTED = '#666666';
const INK = '#111111';

function formatTokens(value: string): string {
  const number = Number(value);
  return Number.isFinite(number)
    ? number.toLocaleString('en-US', { maximumFractionDigits: 4 })
    : value;
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

/**
 * Renders a ProofAccountReport as a multi-page PDF: account summary, a
 * per-type ledger breakdown (so a reader can verify the summary figures
 * themselves), then the full itemized transaction history. Meant to be
 * handed to a trainer who has questioned their balance -- every number in
 * the summary must be traceable to a line in the tables below it.
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

    doc.fillColor(ACCENT).fontSize(20).font('Helvetica-Bold').text('Dialect Library');
    doc
      .fillColor(INK)
      .fontSize(14)
      .font('Helvetica-Bold')
      .text('Account proof report', { paragraphGap: 4 });
    doc
      .fillColor(MUTED)
      .fontSize(10)
      .font('Helvetica')
      .text(`${accountLabel} -- account opened ${formatDate(report.accountCreatedAt)}`);
    doc.text(`Generated ${formatDateTime(report.generatedAt)}`);
    doc.moveDown(1.5);

    const stats: [string, string][] = [
      ['Total tokens since join', `${formatTokens(report.summary.totalTokensSinceJoin)} DL`],
      ['Available balance', `${formatTokens(report.summary.availableBalanceTokens)} DL`],
      ['Held balance', `${formatTokens(report.summary.heldBalanceTokens)} DL`],
      ['Total withdrawn', `${formatTokens(report.summary.totalWithdrawnTokens)} DL`],
      ['Total recordings', String(report.summary.totalRecordings)],
      ['Scored recordings', String(report.summary.scoredRecordings)],
      ['Average score', report.summary.avgScore ? `${report.summary.avgScore}%` : '—'],
    ];

    const colWidth = (doc.page.width - doc.page.margins.left - doc.page.margins.right) / 2;
    let column = 0;
    let rowTop = doc.y;
    let rowHeight = 0;
    for (const [label, value] of stats) {
      const x = doc.page.margins.left + column * colWidth;
      doc.fillColor(MUTED).fontSize(8).font('Helvetica-Bold').text(label.toUpperCase(), x, rowTop, {
        width: colWidth - 12,
      });
      doc
        .fillColor(INK)
        .fontSize(13)
        .font('Helvetica-Bold')
        .text(value, x, doc.y, { width: colWidth - 12 });
      rowHeight = Math.max(rowHeight, doc.y - rowTop);
      column += 1;
      if (column === 2) {
        column = 0;
        rowTop += rowHeight + 14;
        rowHeight = 0;
      }
    }
    doc.y = column === 0 ? rowTop : rowTop + rowHeight + 14;
    doc.moveDown(1);

    doc
      .strokeColor('#dddddd')
      .moveTo(doc.page.margins.left, doc.y)
      .lineTo(doc.page.width - doc.page.margins.right, doc.y)
      .stroke();
    doc.moveDown(1);

    doc
      .fillColor(INK)
      .fontSize(12)
      .font('Helvetica-Bold')
      .text('Balance breakdown by transaction type');
    doc
      .fillColor(MUTED)
      .fontSize(8)
      .font('Helvetica')
      .text('Every credit and debit type ever posted to this wallet, summed.');
    doc.moveDown(0.5);

    const tableX = doc.page.margins.left;
    const tableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const typeColWidth = tableWidth * 0.45;
    const countColWidth = tableWidth * 0.2;
    const amountColWidth = tableWidth * 0.35;

    function drawBreakdownRow(type: string, count: string, amount: string, header = false) {
      const y = doc.y;
      doc
        .fillColor(header ? MUTED : INK)
        .fontSize(9)
        .font(header ? 'Helvetica-Bold' : 'Helvetica')
        .text(type, tableX, y, { width: typeColWidth })
        .text(count, tableX + typeColWidth, y, { width: countColWidth, align: 'right' })
        .text(amount, tableX + typeColWidth + countColWidth, y, {
          width: amountColWidth,
          align: 'right',
        });
      doc.moveDown(0.4);
    }

    drawBreakdownRow('Type', 'Count', 'Net amount (DL)', true);
    for (const row of report.ledgerTotalsByType) {
      if (doc.y > doc.page.height - doc.page.margins.bottom - 20) doc.addPage();
      drawBreakdownRow(row.type.replace(/_/g, ' '), String(row.count), formatTokens(row.totalAmount));
    }

    doc.moveDown(1.5);
    doc.fillColor(INK).fontSize(12).font('Helvetica-Bold').text('Full transaction history');
    doc
      .fillColor(MUTED)
      .fontSize(8)
      .font('Helvetica')
      .text('Every ledger entry on this wallet, oldest first.');
    doc.moveDown(0.5);

    const dateColWidth = tableWidth * 0.22;
    const txTypeColWidth = tableWidth * 0.28;
    const txAmountColWidth = tableWidth * 0.2;
    const refColWidth = tableWidth * 0.3;

    function drawTxRow(
      date: string,
      type: string,
      amount: string,
      reference: string,
      header = false,
    ) {
      const y = doc.y;
      doc
        .fillColor(header ? MUTED : INK)
        .fontSize(8)
        .font(header ? 'Helvetica-Bold' : 'Helvetica')
        .text(date, tableX, y, { width: dateColWidth })
        .text(type, tableX + dateColWidth, y, { width: txTypeColWidth })
        .text(amount, tableX + dateColWidth + txTypeColWidth, y, {
          width: txAmountColWidth,
          align: 'right',
        })
        .text(reference, tableX + dateColWidth + txTypeColWidth + txAmountColWidth, y, {
          width: refColWidth,
        });
      doc.moveDown(0.4);
    }

    drawTxRow('Date', 'Type', 'Amount (DL)', 'Reference', true);
    for (const entry of report.ledgerEntries) {
      if (doc.y > doc.page.height - doc.page.margins.bottom - 20) doc.addPage();
      drawTxRow(
        formatDate(entry.createdAt),
        entry.type.replace(/_/g, ' '),
        formatTokens(entry.amount),
        entry.reference ?? '—',
      );
    }

    doc.moveDown(1.5);
    doc
      .fillColor(MUTED)
      .fontSize(8)
      .font('Helvetica')
      .text('Generated by Dialect Library. For questions, contact hello@dialectlibrary.com.');

    doc.end();
  });
}

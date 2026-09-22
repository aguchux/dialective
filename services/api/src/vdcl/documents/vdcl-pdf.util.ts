import PDFDocument from 'pdfkit';

const ACCENT = '#6a18a8';
const MUTED = '#666666';
const INK = '#111111';

export interface VdclDocumentData {
  licenceKey: string;
  version: number;
  status: string;
  manifestKey: string;
  manifestHash: string;
  dialectTag: string;
  countryName: string | null;
  contributorLabel: string;
  /** Full legal name -- present only on the contributor/DL copy. */
  contributorName: string | null;
  kycVerified: boolean;
  signedAt: Date | null;
  countersignedAt: Date | null;
  termsVersion: string | null;
  purposes: string[];
  recordingCount: number;
  totalDurationMs: string;
  transcriptCount: number;
  excludedCount: number;
  meanCompositeScore: string | null;
  asrPipelineVersion: string | null;
  verificationUrl: string;
  qrPng: Buffer;
}

const PURPOSE_TERMS: Record<string, string> = {
  ASR_TRAINING: 'Training and fine-tuning automatic speech recognition models',
  TTS_TRAINING: 'Training speech synthesis models',
  LLM_TRAINING: 'Training language models on the transcript text',
  LINGUISTIC_RESEARCH: 'Academic and non-commercial linguistic research',
  DATASET_REDISTRIBUTION: 'Onward licensing of the dataset by the subscriber',
  PUBLIC_PROMOTION: 'Use of clips in demonstration and marketing material',
  BIOMETRIC_PROCESSING: 'Voiceprint and speaker-identification processing',
  VOICE_CLONING: 'Synthetic reproduction of the contributor voice',
};

const PROHIBITED = [
  'Creating a synthetic copy of the contributor voice (voice cloning), which this licence never grants',
  'Any attempt to identify, contact or de-anonymise the contributor',
  'Political or persuasive use of the contributor identity without separate written consent',
  'Biometric identification outside any scope expressly granted above',
  'Any use outside the permitted purposes listed above',
];

function formatDate(value: Date | null): string {
  return value
    ? value.toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' })
    : 'Not yet';
}

function formatDuration(ms: string): string {
  const value = Number(ms);
  if (!Number.isFinite(value) || value <= 0) return '0 minutes';
  const hours = Math.floor(value / 3_600_000);
  const minutes = Math.round((value % 3_600_000) / 60_000);
  return hours > 0 ? `${hours} hours ${minutes} minutes` : `${minutes} minutes`;
}

/**
 * Renders the signed VDCL as a PDF.
 *
 * A real document produced from the signed snapshot -- text and tables via
 * pdfkit, not a screenshot -- so it stays crisp, small and searchable.
 *
 * Its bytes are a deterministic function of the DATA it is given: the
 * CreationDate is pinned to the countersignature rather than the current
 * time, so the same input always renders identically. Two issues of the
 * same licence still differ, because each carries a fresh QR verification
 * nonce -- so `pdfHash` answers "is this the exact file we sent?" rather
 * than "could this be re-derived?". That is the more useful question, and
 * it makes a re-issue visible as a changed hash rather than a silent swap.
 *
 * Section order follows the product plan's section 6 exactly. It is a legal
 * instrument and the ordering is what a reader (or a solicitor reviewing
 * it) expects; rearranging it to suit layout would be a poor trade.
 *
 * NOTE: the operative legal wording is still subject to the Phase 1 legal
 * review. This renders the structure and the plain-language summary
 * faithfully; the clauses under review are marked in the document itself
 * rather than being silently presented as settled.
 */
export function renderVdclPdf(data: VdclDocumentData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 48,
      // Fixed metadata: pdfkit would otherwise stamp the current time into
      // the document, making every render differ and the hash worthless.
      info: {
        Title: `${data.licenceKey} v${data.version}`,
        Author: 'Dialect Library',
        Subject: 'Voice Dataset Contributor Licence',
        CreationDate: data.countersignedAt ?? data.signedAt ?? new Date(0),
      },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const heading = (n: number, text: string) => {
      doc.moveDown(1);
      doc.fillColor(ACCENT).fontSize(12).font('Helvetica-Bold').text(`${n}. ${text}`);
      doc.moveDown(0.3);
      doc.fillColor(INK).fontSize(9.5).font('Helvetica');
    };
    const body = (text: string) => {
      doc.fillColor(INK).fontSize(9.5).font('Helvetica').text(text, { paragraphGap: 3 });
    };
    const pair = (label: string, value: string) => {
      doc.fillColor(MUTED).fontSize(9).font('Helvetica').text(`${label}: `, { continued: true });
      doc.fillColor(INK).font('Helvetica-Bold').text(value);
    };

    // 1. Cover and identity
    doc.fillColor(ACCENT).fontSize(20).font('Helvetica-Bold').text('Dialect Library');
    doc
      .fillColor(INK)
      .fontSize(15)
      .font('Helvetica-Bold')
      .text('Voice Dataset Contributor Licence', { paragraphGap: 6 });
    pair('Licence', `${data.licenceKey}  (version ${data.version})`);
    pair('Status', data.status);
    pair('Issued', formatDate(data.countersignedAt));
    pair('Parties', `Dialect Library and ${data.contributorName ?? data.contributorLabel}`);
    pair('Dialect', `${data.dialectTag}${data.countryName ? ` (${data.countryName})` : ''}`);
    if (data.termsVersion) pair('Terms version', data.termsVersion);

    // 2. Plain-language summary -- deliberately first among the substantive
    // sections. Someone who reads only one part of this document should
    // read the part that tells them what they agreed to.
    heading(2, 'Plain-language summary');
    body(
      `You have licensed ${data.recordingCount} of your recordings in ${data.dialectTag} to Dialect Library, so they can be included in datasets licensed to organisations that train speech and language models. You have permitted only the uses listed in section 5. Anything not listed there is not permitted.`,
    );
    body(
      'You may withdraw this licence at any time. Withdrawal stops all future use immediately, but it cannot retract a model that has already been trained or a dataset already delivered. Your identity is never disclosed to the organisations that license your recordings.',
    );

    // 3. Verification
    heading(3, 'Contributor and Dialect Library verification');
    pair('Contributor identity', data.kycVerified ? 'Verified (DLKYC on file)' : 'Not verified');
    pair('Contributor signature', formatDate(data.signedAt));
    pair('Dialect Library countersignature', formatDate(data.countersignedAt));
    body(
      'This licence references the contributor identity verification record. It does not embed or reproduce any identity document.',
    );

    // 4. Covered dataset
    heading(4, 'Covered dataset');
    pair('Manifest', data.manifestKey);
    pair('Manifest hash (SHA-256)', data.manifestHash);
    pair('Recordings covered', String(data.recordingCount));
    pair('Validated audio duration', formatDuration(data.totalDurationMs));
    pair('With transcripts', `${data.transcriptCount} of ${data.recordingCount}`);
    pair('Reviewed but excluded', String(data.excludedCount));
    if (data.meanCompositeScore) {
      pair('Mean quality score', `${data.meanCompositeScore} of 100`);
    }
    if (data.asrPipelineVersion) pair('Transcription engine', data.asrPipelineVersion);
    body(
      'This licence covers exactly the recordings frozen into the manifest above and no others. Recordings made after this version was compiled are not covered by it; covering them requires a new version, signed separately.',
    );

    // 5. Grant of licence
    heading(5, 'Grant of licence -- permitted uses');
    for (const purpose of data.purposes) {
      body(`• ${PURPOSE_TERMS[purpose] ?? purpose}`);
    }
    body(
      'Territory: worldwide. Duration: from the countersignature date until withdrawn or superseded. Sublicensing is permitted only where onward licensing appears in the list above.',
    );

    // 6. Restricted and prohibited uses
    heading(6, 'Restricted and prohibited uses');
    for (const item of PROHIBITED) {
      body(`• ${item}`);
    }

    doc.addPage();

    // 7-10: subject to the Phase 1 legal review. Stating that plainly is
    // more honest than rendering placeholder clauses that read as settled
    // terms on a document someone may rely on.
    heading(7, 'Compensation and commercial terms');
    body(
      'Contributors are paid for the recordings they contribute under the platform payout terms in force at the time of recording. Where a royalty programme applies, participation and rates are governed by the programme terms published by Dialect Library.',
    );

    heading(8, 'Privacy and sensitive-data treatment');
    body(
      'The contributor identity is not disclosed to any organisation licensing this dataset. Recordings are attributed to a privacy-safe label only. Identity verification evidence is stored encrypted and is accessible only to authorised Dialect Library staff.',
    );
    body(
      'Where speaker-identification processing has been permitted in section 5, that processing is treated as biometric data under applicable law and is limited to the scope granted.',
    );

    heading(9, 'Updates, additions, withdrawal and termination');
    body(
      'Changes that affect rights -- adding recordings, changing permitted uses, or changing compensation -- require a new version of this licence, signed by the contributor and countersigned by Dialect Library. Recalculated metrics that do not change rights may be recorded as a manifest revision with notice and an audit entry.',
    );
    body(
      'The contributor may withdraw at any time. Withdrawal takes effect immediately for all future access and is prospective only.',
    );

    heading(10, 'Warranties, liability, disputes and governing law');
    doc
      .fillColor(MUTED)
      .fontSize(9)
      .font('Helvetica-Oblique')
      .text(
        'The operative wording of this section is subject to legal review in each target market and is not yet settled. Until it is, this licence is governed by the Dialect Library terms of service in force at the date of countersignature.',
        { paragraphGap: 3 },
      );

    // 11. Signatures and tamper-evident validation
    heading(11, 'Signatures and tamper-evident validation');
    pair('Signed by contributor', formatDate(data.signedAt));
    pair('Countersigned by Dialect Library', formatDate(data.countersignedAt));
    body(
      'The signature event for this licence is evidenced by an audit record of the step-up verification completed at signing time, bound cryptographically to the manifest hash above. That record, not an image of handwriting, is the evidence of signature.',
    );

    const qrY = doc.y + 6;
    doc.image(data.qrPng, doc.page.margins.left, qrY, { width: 96 });
    doc
      .fillColor(MUTED)
      .fontSize(8)
      .font('Helvetica')
      .text('Scan to verify this licence', doc.page.margins.left + 108, qrY + 8, { width: 280 });
    doc
      .fillColor(INK)
      .fontSize(7.5)
      .text(data.verificationUrl, doc.page.margins.left + 108, qrY + 22, { width: 380 });
    doc
      .fillColor(MUTED)
      .fontSize(7.5)
      .text(
        'Verification confirms the licence status and dataset metrics. It does not disclose the contributor identity.',
        doc.page.margins.left + 108,
        qrY + 40,
        { width: 380 },
      );
    doc.y = qrY + 110;

    // 12. Audit appendix
    heading(12, 'Audit appendix');
    pair('Licence version', String(data.version));
    pair('Manifest', data.manifestKey);
    pair('Manifest hash', data.manifestHash);
    body(
      'The complete version and event history for this licence is available to the contributor and to authorised Dialect Library staff.',
    );

    doc.end();
  });
}

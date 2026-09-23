import * as QRCode from 'qrcode';
import { renderVdclCertificatePng } from './vdcl-png.util';
import type { VdclDocumentData } from './vdcl-pdf.util';

/**
 * Layout regressions on the certificate, caught by measuring the rendered
 * canvas rather than by reading the code.
 *
 * The bug these exist for: the canvas was a flat 820px with the
 * verification panel pinned to HEIGHT - 232, so a licence granting all
 * seven purposes drew its permitted-uses list straight through the panel.
 * The last purposes were unreadable underneath it -- on the one document
 * whose job is to tell a contributor what they permitted.
 */
describe('VDCL certificate layout', () => {
  // A real QR -- node-canvas loadImage rejects an empty buffer, and the
  // renderer draws the QR on every path.
  let qrPng: Buffer;
  beforeAll(async () => {
    qrPng = await QRCode.toBuffer('https://dialectlibrary.com/verify/x', {
      width: 128,
      margin: 1,
    });
  });

  function data(overrides: Partial<VdclDocumentData> = {}): VdclDocumentData {
    return {
      licenceKey: 'VDCL-NG-29730152',
      version: 1,
      status: 'ACTIVE',
      manifestKey: 'VDM-NG-29730152-1',
      manifestHash: 'a'.repeat(64),
      dialectTags: ['Igbo'],
      countryName: 'Nigeria',
      contributorLabel: 'Contributor 297301',
      contributorName: null,
      kycVerified: true,
      signedAt: new Date('2026-09-23T00:00:00Z'),
      countersignedAt: new Date('2026-09-23T00:00:00Z'),
      termsVersion: 'vdcl-terms-1.0',
      purposes: ['ASR_TRAINING'],
      recordingCount: 42,
      totalDurationMs: '89000',
      transcriptCount: 41,
      excludedCount: 3,
      meanCompositeScore: '31.52',
      asrPipelineVersion: 'whisper',
      verificationUrl: 'https://dialectlibrary.com/verify/x',
      qrPng,
      ...overrides,
    };
  }

  /** PNG dimensions live in the IHDR chunk, bytes 16-23. */
  function size(png: Buffer): { width: number; height: number } {
    return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
  }

  const ALL_SEVEN = [
    'ASR_TRAINING',
    'TTS_TRAINING',
    'LLM_TRAINING',
    'LINGUISTIC_RESEARCH',
    'DATASET_REDISTRIBUTION',
    'PUBLIC_PROMOTION',
    'BIOMETRIC_PROCESSING',
  ];

  it('keeps the familiar height for a short list', async () => {
    const png = await renderVdclCertificatePng(data());
    expect(size(png).height).toBe(820);
    expect(size(png).width).toBe(1200);
  });

  it('grows so seven purposes cannot overlap the verification panel', async () => {
    // The exact failure in production: seven purposes on a fixed canvas.
    const png = await renderVdclCertificatePng(data({ purposes: ALL_SEVEN }));
    expect(size(png).height).toBeGreaterThan(820);
  });

  it('grows monotonically with the number of purposes', async () => {
    const heights: number[] = [];
    for (const count of [1, 3, 5, 7]) {
      const png = await renderVdclCertificatePng(
        data({ purposes: ALL_SEVEN.slice(0, count) }),
      );
      heights.push(size(png).height);
    }
    // Never shrinks, and the tall case is genuinely taller than the short.
    for (let i = 1; i < heights.length; i += 1) {
      expect(heights[i]).toBeGreaterThanOrEqual(heights[i - 1]);
    }
    expect(heights[3]).toBeGreaterThan(heights[0]);
  });

  it('renders whatever it is given rather than capping the list', async () => {
    // The old cap was a hardcoded 7, which happened to equal the number of
    // offerable purposes -- so an eighth would have been silently dropped
    // from the document that states what was permitted.
    const eight = [...ALL_SEVEN, 'SOME_FUTURE_PURPOSE'];
    const seven = await renderVdclCertificatePng(data({ purposes: ALL_SEVEN }));
    const png = await renderVdclCertificatePng(data({ purposes: eight }));
    expect(size(png).height).toBeGreaterThan(size(seven).height);
  });

  it('renders a multi-dialect licence without throwing', async () => {
    const png = await renderVdclCertificatePng(
      data({
        dialectTags: ['Igbo', 'Nigerian Pidgin', 'Yoruba'],
        purposes: ALL_SEVEN,
      }),
    );
    expect(png.length).toBeGreaterThan(0);
  });

  it('handles dialect names long enough to need the overflow fallback', async () => {
    const png = await renderVdclCertificatePng(
      data({
        dialectTags: [
          'Arabic (Jordanian)',
          'Arabic (Emirati)',
          'Arabic (Tunisian)',
          'Amharic',
        ],
      }),
    );
    expect(png.length).toBeGreaterThan(0);
  });
});

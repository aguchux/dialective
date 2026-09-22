import type * as CanvasModule from 'canvas';
import type { VdclDocumentData } from './vdcl-pdf.util';

const ACCENT = '#6a18a8';
const INK = '#111111';
const MUTED = '#666666';
const LINE = '#e3e3e8';

const WIDTH = 1200;
const HEIGHT = 820;

const PURPOSE_LABELS: Record<string, string> = {
  ASR_TRAINING: 'Speech recognition',
  TTS_TRAINING: 'Speech synthesis',
  LLM_TRAINING: 'Language models',
  LINGUISTIC_RESEARCH: 'Academic research',
  DATASET_REDISTRIBUTION: 'Onward licensing',
  PUBLIC_PROMOTION: 'Demos and marketing',
  BIOMETRIC_PROCESSING: 'Speaker identification',
};

const STATUS_COLOURS: Record<string, string> = {
  ACTIVE: '#0f7a3d',
  SUSPENDED: '#b45309',
  WITHDRAWN: '#b91c1c',
  SUPERSEDED: '#525252',
};

function formatDuration(ms: string): string {
  const value = Number(ms);
  if (!Number.isFinite(value) || value <= 0) return '0m';
  const hours = Math.floor(value / 3_600_000);
  const minutes = Math.round((value % 3_600_000) / 60_000);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

/**
 * Renders the one-page PNG certificate.
 *
 * A portable visual summary, explicitly NOT a substitute for the signed
 * PDF -- the document says so on its face, because a shareable image that
 * looks like a contract invites people to treat it as one.
 *
 * The contributor is identified only by the privacy-safe label. A PNG is
 * the most shareable artefact in the whole product: it gets pasted into
 * slide decks, attached to emails and posted publicly. Whatever appears
 * here should be assumed to be permanently public, which is why the
 * contributor's real name never reaches this renderer at all -- the caller
 * passes the label, and there is no code path that would print the name.
 *
 * Fonts are the generic `sans-serif` rather than a named family, matching
 * kyc-evidence-redaction. node-canvas resolves families against the host's
 * fontconfig, and naming a family the container does not ship silently
 * falls back -- which would mean the certificate rendered differently in
 * production than anywhere it was reviewed.
 *
 * `canvas` is imported lazily, matching the existing kyc/face-match
 * pattern: it is a native module, and a missing build must fail at the one
 * route that needs it rather than at application boot.
 */
export async function renderVdclCertificatePng(data: VdclDocumentData): Promise<Buffer> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const canvasLib = require('canvas') as typeof CanvasModule;
  const canvas = canvasLib.createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Brand rail
  ctx.fillStyle = ACCENT;
  ctx.fillRect(0, 0, WIDTH, 14);

  let y = 76;
  ctx.fillStyle = ACCENT;
  ctx.font = 'bold 34px sans-serif';
  ctx.fillText('Dialect Library', 64, y);

  y += 44;
  ctx.fillStyle = INK;
  ctx.font = 'bold 28px sans-serif';
  ctx.fillText('Voice Dataset Contributor Licence', 64, y);

  y += 40;
  ctx.fillStyle = MUTED;
  ctx.font = '20px sans-serif';
  ctx.fillText(`${data.licenceKey}   ·   version ${data.version}`, 64, y);

  // Status badge
  const badgeColour = STATUS_COLOURS[data.status] ?? MUTED;
  ctx.fillStyle = badgeColour;
  const badgeText = data.status.replace(/_/g, ' ');
  ctx.font = 'bold 18px sans-serif';
  const badgeWidth = ctx.measureText(badgeText).width + 36;
  ctx.fillRect(WIDTH - 64 - badgeWidth, 56, badgeWidth, 40);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(badgeText, WIDTH - 64 - badgeWidth + 18, 83);

  y += 36;
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(64, y);
  ctx.lineTo(WIDTH - 64, y);
  ctx.stroke();

  // Identity block -- label only, never a name.
  y += 44;
  ctx.fillStyle = MUTED;
  ctx.font = '16px sans-serif';
  ctx.fillText('CONTRIBUTOR', 64, y);
  ctx.fillText('DIALECT', 400, y);
  ctx.fillText('COUNTRY', 700, y);

  y += 30;
  ctx.fillStyle = INK;
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText(data.contributorLabel, 64, y);
  ctx.fillText(data.dialectTag, 400, y);
  ctx.fillText(data.countryName ?? '—', 700, y);

  // Metrics
  y += 60;
  const metrics: [string, string][] = [
    ['RECORDINGS', String(data.recordingCount)],
    ['VALIDATED AUDIO', formatDuration(data.totalDurationMs)],
    ['WITH TRANSCRIPTS', `${data.transcriptCount}/${data.recordingCount}`],
    ['MEAN QUALITY', data.meanCompositeScore ? `${data.meanCompositeScore}/100` : '—'],
  ];
  metrics.forEach(([label, value], index) => {
    const x = 64 + index * 272;
    ctx.fillStyle = MUTED;
    ctx.font = '15px sans-serif';
    ctx.fillText(label, x, y);
    ctx.fillStyle = INK;
    ctx.font = 'bold 30px sans-serif';
    ctx.fillText(value, x, y + 38);
  });

  // Permitted uses
  y += 96;
  ctx.fillStyle = MUTED;
  ctx.font = '15px sans-serif';
  ctx.fillText('PERMITTED USES', 64, y);
  y += 28;
  ctx.fillStyle = INK;
  ctx.font = '18px sans-serif';
  for (const purpose of data.purposes) {
    ctx.fillText(`•  ${PURPOSE_LABELS[purpose] ?? purpose}`, 64, y);
    y += 26;
  }

  // Signature status
  y += 18;
  ctx.fillStyle = MUTED;
  ctx.font = '15px sans-serif';
  ctx.fillText(
    `Contributor signed: ${data.signedAt ? data.signedAt.toISOString().slice(0, 10) : 'not yet'}    ·    Dialect Library countersigned: ${
      data.countersignedAt ? data.countersignedAt.toISOString().slice(0, 10) : 'not yet'
    }`,
    64,
    y,
  );

  // QR verification mark
  const qr = await canvasLib.loadImage(data.qrPng);
  ctx.drawImage(qr, WIDTH - 220, HEIGHT - 240, 156, 156);
  ctx.fillStyle = MUTED;
  ctx.font = '14px sans-serif';
  ctx.fillText('Scan to verify', WIDTH - 210, HEIGHT - 66);

  // The disclaimer is not decoration. Without it a shareable image reads
  // as the licence itself.
  ctx.fillStyle = MUTED;
  ctx.font = 'italic 16px sans-serif';
  ctx.fillText('See signed PDF for complete terms.', 64, HEIGHT - 76);
  ctx.font = '13px sans-serif';
  ctx.fillText(
    'Verification confirms licence status and dataset metrics only. It does not disclose contributor identity.',
    64,
    HEIGHT - 50,
  );

  return canvas.toBuffer('image/png');
}

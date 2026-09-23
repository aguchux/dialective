import type * as CanvasModule from 'canvas';
import type { VdclDocumentData } from './vdcl-pdf.util';
import { formatDurationShort } from './vdcl-duration.util';
import {
  ACCENT,
  ACCENT_DARK,
  GREEN,
  GREEN_DARK,
  GREEN_SOFT,
  INK,
  LINE,
  MUTED,
  SURFACE,
  SURFACE_MUTED,
  isInForce,
  statusColour,
} from './vdcl-theme';

const WIDTH = 1200;
/**
 * The canvas grows with the permitted-uses list rather than being fixed.
 *
 * It used to be a flat 820px with the verification panel pinned to
 * HEIGHT - 232, so a licence granting all seven purposes rendered its list
 * straight through the panel -- the two overlapped, and the last purposes
 * were unreadable underneath it. A contributor could not tell what they
 * had actually permitted, on the one document that exists to tell them.
 *
 * MIN_HEIGHT keeps the familiar proportions for the common case; anything
 * taller extends downward.
 */
const MIN_HEIGHT = 820;
const PURPOSE_LINE_H = 27;
const PAD = 64;
const RIGHT = WIDTH - PAD;

/**
 * Where the permitted-uses list starts, measured from the top.
 *
 * Follows the metric cards rather than sitting at an arbitrary offset:
 * licence line (176) + identity block (46) + metrics gap (68) + card
 * height (92) + breathing room (40). Pinning it lower left a visible dead
 * band under the cards.
 */
const USES_TOP = 176 + 46 + 68 + 92 + 40;
/** Panel block: the verification card, disclaimer and footer rule. */
const FOOTER_BLOCK_H = 232;

/**
 * How tall this certificate needs to be for its own content.
 *
 * Derived from the same constants the renderer lays out with, so the two
 * cannot disagree -- a height computed from a different assumption than
 * the drawing code is how the overlap happened in the first place.
 */
function measureHeight(purposeCount: number): number {
  const listBottom = USES_TOP + 30 + purposeCount * PURPOSE_LINE_H;
  return Math.max(MIN_HEIGHT, listBottom + 24 + FOOTER_BLOCK_H);
}

const PURPOSE_LABELS: Record<string, string> = {
  ASR_TRAINING: 'Speech recognition',
  TTS_TRAINING: 'Speech synthesis',
  LLM_TRAINING: 'Language models',
  LINGUISTIC_RESEARCH: 'Academic research',
  DATASET_REDISTRIBUTION: 'Onward licensing',
  PUBLIC_PROMOTION: 'Demos and marketing',
  BIOMETRIC_PROCESSING: 'Speaker identification',
};

type Ctx = CanvasModule.CanvasRenderingContext2D;

/** Rounded rect -- node-canvas has no roundRect, and square cards read as unfinished next to the site's rounded ones. */
function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/** The verified tick, drawn rather than pulled from a font the container may not ship. */
function drawTick(ctx: Ctx, cx: number, cy: number, size: number, colour: string) {
  ctx.strokeStyle = colour;
  ctx.lineWidth = Math.max(2, size * 0.16);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.32, cy + size * 0.02);
  ctx.lineTo(cx - size * 0.08, cy + size * 0.26);
  ctx.lineTo(cx + size * 0.34, cy - size * 0.28);
  ctx.stroke();
}

/**
 * Renders the one-page PNG certificate.
 *
 * A portable visual summary, explicitly NOT a substitute for the signed
 * PDF -- the document says so on its face, because a shareable image that
 * looks like a contract invites people to treat it as one.
 *
 * Colour comes from vdcl-theme, shared with the PDF, so the two cannot
 * drift apart: a contributor sees them side by side and they are two views
 * of one instrument. Purple is the brand; green appears ONLY where the
 * licence is genuinely in force, so the seal means something rather than
 * being trim. A suspended or withdrawn licence renders its own status
 * colour and gets no seal at all.
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
  const HEIGHT = measureHeight(data.purposes.length);
  const canvas = canvasLib.createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  const inForce = isInForce(data.status);
  const badgeColour = statusColour(data.status);

  ctx.fillStyle = SURFACE;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Masthead. The gradient is the site's accent -> accent-dark, the same
  // pair the dashboard hero uses.
  const rail = ctx.createLinearGradient(0, 0, WIDTH, 0);
  rail.addColorStop(0, ACCENT_DARK);
  rail.addColorStop(1, ACCENT);
  ctx.fillStyle = rail;
  ctx.fillRect(0, 0, WIDTH, 132);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 32px sans-serif';
  ctx.fillText('Dialect Library', PAD, 60);
  ctx.font = '20px sans-serif';
  ctx.fillText('Voice Dataset Contributor Licence', PAD, 96);

  // Status badge, sitting in the masthead so it is the first thing read.
  ctx.font = 'bold 17px sans-serif';
  const badgeText = data.status.replace(/_/g, ' ');
  const badgeW = ctx.measureText(badgeText).width + (inForce ? 62 : 40);
  const badgeX = RIGHT - badgeW;
  ctx.fillStyle = inForce ? GREEN : badgeColour;
  roundRect(ctx, badgeX, 48, badgeW, 42, 21);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  if (inForce) {
    drawTick(ctx, badgeX + 26, 69, 18, '#ffffff');
    ctx.fillText(badgeText, badgeX + 44, 76);
  } else {
    ctx.fillText(badgeText, badgeX + 20, 76);
  }

  let y = 176;
  ctx.fillStyle = MUTED;
  ctx.font = '19px sans-serif';
  ctx.fillText(`${data.licenceKey}   ·   version ${data.version}`, PAD, y);

  // Identity block -- label only, never a name.
  y += 46;
  // Measure in the font the value is actually DRAWN in. fitDialects was
  // being called while ctx.font was still the 19px licence line, so it
  // under-measured a bold 22px string and let "+2 more" run into the
  // country column.
  ctx.font = 'bold 22px sans-serif';
  const cols: [string, string][] = [
    ['CONTRIBUTOR', data.contributorLabel],
    [data.dialectTags.length === 1 ? 'DIALECT' : 'DIALECTS', fitDialects(ctx, data.dialectTags)],
    ['COUNTRY', data.countryName ?? '—'],
  ];
  // Uneven tracks on purpose. Contributor and country are short and fixed
  // in length; the dialect list is the only one that grows, so it gets the
  // wide middle track rather than all three being an equal 336. With even
  // tracks "Igbo, Nigerian Pidgin, Yoruba" collided with the country.
  const COL_X = [0, 300, 760];
  cols.forEach(([label, value], i) => {
    const x = PAD + COL_X[i];
    ctx.fillStyle = MUTED;
    ctx.font = '15px sans-serif';
    ctx.fillText(label, x, y);
    ctx.fillStyle = INK;
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText(value, x, y + 30);
  });

  // Metrics, as cards rather than bare numbers -- the site renders its own
  // stats this way (see VdclMaker's Stat), and a certificate that shares
  // the product's shapes reads as issued by it.
  y += 68;
  const metrics: [string, string][] = [
    ['RECORDINGS', String(data.recordingCount)],
    ['VALIDATED AUDIO', formatDurationShort(data.totalDurationMs)],
    ['WITH TRANSCRIPTS', `${data.transcriptCount}/${data.recordingCount}`],
    ['MEAN QUALITY', data.meanCompositeScore ? `${data.meanCompositeScore}/100` : '—'],
  ];
  const cardW = (WIDTH - PAD * 2 - 3 * 16) / 4;
  metrics.forEach(([label, value], i) => {
    const x = PAD + i * (cardW + 16);
    ctx.fillStyle = SURFACE_MUTED;
    roundRect(ctx, x, y, cardW, 92, 12);
    ctx.fill();
    ctx.fillStyle = MUTED;
    ctx.font = '13px sans-serif';
    ctx.fillText(label, x + 16, y + 28);
    ctx.fillStyle = INK;
    ctx.font = 'bold 30px sans-serif';
    ctx.fillText(value, x + 16, y + 68);
  });

  // Permitted uses. Ticks are green only when the licence is in force --
  // an unticked list on a withdrawn licence would still read as granting.
  y = USES_TOP;
  ctx.fillStyle = MUTED;
  ctx.font = '15px sans-serif';
  ctx.fillText('PERMITTED USES', PAD, y);
  y += 30;
  ctx.font = '18px sans-serif';
  const markColour = inForce ? GREEN : MUTED;
  // Every purpose, never a slice. This used to cap at 7 -- which happened
  // to equal the number of offerable purposes, so it silently truncated
  // the moment an eighth was ever offered. The canvas grows instead.
  for (const purpose of data.purposes) {
    drawTick(ctx, PAD + 9, y - 6, 15, markColour);
    ctx.fillStyle = INK;
    ctx.fillText(PURPOSE_LABELS[purpose] ?? purpose, PAD + 30, y);
    y += PURPOSE_LINE_H;
  }

  // Verification panel. Tinted green only when in force; otherwise it takes
  // the neutral surface so the document never implies a status it lacks.
  // Below the list, always. Pinning this to HEIGHT - 232 is what let the
  // permitted-uses list run through it.
  const panelY = Math.max(y + 24, HEIGHT - FOOTER_BLOCK_H);
  const panelW = 660;
  ctx.fillStyle = inForce ? GREEN_SOFT : SURFACE_MUTED;
  roundRect(ctx, PAD, panelY, panelW, 118, 14);
  ctx.fill();
  ctx.strokeStyle = inForce ? GREEN : LINE;
  ctx.lineWidth = 1;
  roundRect(ctx, PAD, panelY, panelW, 118, 14);
  ctx.stroke();

  if (inForce) drawTick(ctx, PAD + 28, panelY + 34, 20, GREEN_DARK);
  ctx.fillStyle = inForce ? GREEN_DARK : INK;
  ctx.font = 'bold 17px sans-serif';
  ctx.fillText(
    inForce ? 'Signed and countersigned' : 'Signature status',
    PAD + (inForce ? 52 : 20),
    panelY + 40,
  );

  ctx.fillStyle = MUTED;
  ctx.font = '15px sans-serif';
  ctx.fillText(
    `Contributor signed  ${data.signedAt ? data.signedAt.toISOString().slice(0, 10) : 'not yet'}`,
    PAD + 20,
    panelY + 72,
  );
  ctx.fillText(
    `Dialect Library countersigned  ${
      data.countersignedAt ? data.countersignedAt.toISOString().slice(0, 10) : 'not yet'
    }`,
    PAD + 20,
    panelY + 98,
  );

  // QR verification mark, boxed so it reads as a scannable target rather
  // than an image floating on the page.
  const qrSize = 132;
  const qrX = RIGHT - qrSize - 20;
  const qrY = panelY - 6;
  ctx.fillStyle = SURFACE;
  roundRect(ctx, qrX - 20, qrY - 14, qrSize + 40, qrSize + 56, 14);
  ctx.fill();
  ctx.strokeStyle = LINE;
  roundRect(ctx, qrX - 20, qrY - 14, qrSize + 40, qrSize + 56, 14);
  ctx.stroke();
  const qr = await canvasLib.loadImage(data.qrPng);
  ctx.drawImage(qr, qrX, qrY, qrSize, qrSize);
  ctx.fillStyle = MUTED;
  ctx.font = 'bold 13px sans-serif';
  ctx.fillText('SCAN TO VERIFY', qrX + 4, qrY + qrSize + 28);

  // The disclaimer is not decoration. Without it a shareable image reads
  // as the licence itself.
  ctx.fillStyle = MUTED;
  ctx.font = 'italic 15px sans-serif';
  ctx.fillText('See signed PDF for complete terms.', PAD, HEIGHT - 72);
  ctx.font = '13px sans-serif';
  ctx.fillText(
    'Verification confirms licence status and dataset metrics only. It does not disclose contributor identity.',
    PAD,
    HEIGHT - 48,
  );

  // Footer rule in the brand, closing the frame the masthead opens.
  ctx.fillStyle = ACCENT;
  ctx.fillRect(0, HEIGHT - 10, WIDTH, 10);

  return canvas.toBuffer('image/png');
}

/**
 * Fit a dialect list into the certificate's dialect column.
 *
 * Falls back to "first +N more" rather than clipping mid-name, so the
 * certificate never shows a truncated dialect that reads as a different
 * one. The budget is measured against the COUNTRY column's start (336px
 * into the block, less a gutter) rather than a hardcoded 300: these are
 * full names now, not two-letter tags, and "Arabic (Jordanian)" is far
 * wider than "ar-jo".
 */
function fitDialects(
  ctx: { measureText: (t: string) => { width: number } },
  tags: string[],
): string {
  if (tags.length === 0) return '—';
  // The dialect track is 760 - 300 = 460 wide; leave a 32px gutter before
  // the country column so a long list never touches it.
  const MAX_WIDTH = 428;
  const full = tags.join(', ');
  if (ctx.measureText(full).width <= MAX_WIDTH) return full;
  for (let keep = tags.length - 1; keep >= 1; keep -= 1) {
    const candidate = `${tags.slice(0, keep).join(', ')} +${tags.length - keep} more`;
    if (ctx.measureText(candidate).width <= MAX_WIDTH) return candidate;
  }
  return `${tags.length} dialects`;
}

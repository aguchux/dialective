import { renderVdclPdf, type VdclDocumentData } from './vdcl-pdf.util';
import { ACCENT, ACCENT_DARK, GREEN, GREEN_SOFT, INK, LINE, MUTED, SURFACE_MUTED } from './vdcl-theme';

/**
 * The PDF and the PNG are two views of one instrument, and a contributor
 * sees them side by side. These assert the PDF actually draws in the shared
 * palette -- the two files previously declared their own constants and had
 * already drifted (ink #111111, muted #666666, line #e3e3e8, none of which
 * are the site's values).
 *
 * A rendered PDF cannot be inspected without a rasteriser, and neither the
 * dev machine nor the API image ships one. So this records what the
 * renderer asks pdfkit to draw rather than what the bytes look like
 * afterwards, which is the part this change is actually responsible for.
 */
describe('VDCL PDF theme', () => {
  function baseData(overrides: Partial<VdclDocumentData> = {}): VdclDocumentData {
    return {
      licenceKey: 'VDCL-NG-29730152',
      version: 2,
      status: 'ACTIVE',
      manifestKey: 'VDM-NG-29730152-2',
      manifestHash: 'a'.repeat(64),
      dialectTags: ['ig', 'pcm'],
      countryName: 'Nigeria',
      contributorLabel: 'Contributor 297301',
      contributorName: null,
      kycVerified: true,
      signedAt: new Date('2026-09-22T00:00:00Z'),
      countersignedAt: new Date('2026-09-23T00:00:00Z'),
      termsVersion: 'vdcl-terms-1.0',
      purposes: ['ASR_TRAINING'],
      recordingCount: 42,
      totalDurationMs: '3720000',
      transcriptCount: 40,
      excludedCount: 2,
      meanCompositeScore: '81.52',
      asrPipelineVersion: 'whisper',
      verificationUrl: 'https://dialectlibrary.com/verify/x',
      qrPng: Buffer.alloc(0),
      ...overrides,
    };
  }

  /** Every colour the renderer passes to pdfkit, in order. */
  async function coloursUsed(data: VdclDocumentData): Promise<string[]> {
    const colours: string[] = [];
    const record = (c: unknown) => {
      if (typeof c === 'string') colours.push(c.toLowerCase());
    };

    jest.resetModules();
    jest.doMock('pdfkit', () => {
      const stops: string[] = [];
      class FakeDoc {
        page = {
          width: 595,
          height: 842,
          margins: { left: 48, right: 48, top: 48, bottom: 48 },
        };
        x = 48;
        y = 48;
        private handlers: Record<string, ((arg?: unknown) => void)[]> = {};

        on(event: string, fn: (arg?: unknown) => void) {
          (this.handlers[event] ??= []).push(fn);
          // Resolve on the next tick so the caller finishes drawing first.
          if (event === 'end') setImmediate(() => this.handlers.end?.forEach((h) => h()));
          return this;
        }
        end() {
          return this;
        }
        fillColor(c: unknown) {
          record(c);
          return this;
        }
        strokeColor(c: unknown) {
          record(c);
          return this;
        }
        fill(c?: unknown) {
          record(c);
          return this;
        }
        stroke(c?: unknown) {
          record(c);
          return this;
        }
        fillAndStroke(f?: unknown, s?: unknown) {
          record(f);
          record(s);
          return this;
        }
        linearGradient() {
          // stop() is chainable in pdfkit (.stop(0,a).stop(1,b)), so the
          // stub has to return the gradient, not the document.
          const grad = {
            stop(_at: number, c: string) {
              stops.push(c);
              record(c);
              return grad;
            },
          };
          return grad;
        }
        // Everything else is a no-op that keeps the chain alive.
        fontSize() { return this; }
        font() { return this; }
        text() { return this; }
        moveDown() { return this; }
        moveTo() { return this; }
        lineTo() { return this; }
        lineWidth() { return this; }
        rect() { return this; }
        roundedRect() { return this; }
        image() { return this; }
        addPage() { return this; }
        save() { return this; }
        restore() { return this; }
        widthOfString() { return 40; }
      }
      return { __esModule: true, default: FakeDoc };
    });

    const { renderVdclPdf: render } = await import('./vdcl-pdf.util');
    await render(data);
    return colours;
  }

  afterEach(() => {
    jest.dontMock('pdfkit');
    jest.resetModules();
  });

  it('draws only site-token colours, never the old hardcoded ones', async () => {
    const colours = await coloursUsed(baseData());
    // The values that were there before this change.
    expect(colours).not.toContain('#111111');
    expect(colours).not.toContain('#666666');
    expect(colours).not.toContain('#e3e3e8');
    // The values the site actually uses.
    expect(colours).toContain(INK.toLowerCase());
    expect(colours).toContain(MUTED.toLowerCase());
  });

  it('opens on the accent masthead, matching the PNG certificate', async () => {
    const colours = await coloursUsed(baseData());
    expect(colours).toContain(ACCENT.toLowerCase());
    expect(colours).toContain(ACCENT_DARK.toLowerCase());
    expect(colours).toContain(LINE.toLowerCase());
  });

  /**
   * The whole point of reserving green. If a suspended licence rendered any
   * green, the colour would stop carrying information.
   */
  it('uses green only when the licence is in force', async () => {
    const active = await coloursUsed(baseData({ status: 'ACTIVE' }));
    expect(active).toContain(GREEN.toLowerCase());
    expect(active).toContain(GREEN_SOFT.toLowerCase());

    for (const status of ['SUSPENDED', 'WITHDRAWN', 'SUPERSEDED', 'PENDING_COUNTERSIGNATURE']) {
      const other = await coloursUsed(baseData({ status }));
      expect(other).not.toContain(GREEN.toLowerCase());
      expect(other).not.toContain(GREEN_SOFT.toLowerCase());
      // It still draws the panel, just in the neutral surface.
      expect(other).toContain(SURFACE_MUTED.toLowerCase());
    }
  });
});

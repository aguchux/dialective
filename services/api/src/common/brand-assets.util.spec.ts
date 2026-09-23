import { loadLogoPng, loadWhiteLogoPng } from './brand-assets.util';

/**
 * The shipped mark is a purple silhouette meant for light surfaces. Drawn
 * as-is on the VDCL documents' accent masthead it is purple on purple and
 * all but vanishes -- which is how it first rendered there.
 */
describe('brand assets', () => {
  it('finds the logo asset', () => {
    expect(loadLogoPng()).toBeInstanceOf(Buffer);
  });

  it('produces a white knockout distinct from the purple original', () => {
    const purple = loadLogoPng();
    const white = loadWhiteLogoPng();
    expect(white).toBeInstanceOf(Buffer);
    expect(white!.equals(purple!)).toBe(false);
  });

  it('leaves no purple pixels in the knockout', () => {
    // The actual defect, asserted on pixels rather than on byte length:
    // every opaque pixel must be white, or the mark disappears on the
    // masthead again.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createCanvas, Image } = require('canvas');
    const img = new Image();
    img.src = loadWhiteLogoPng()!;
    const canvas = createCanvas(img.width, img.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const { data } = ctx.getImageData(0, 0, img.width, img.height);

    let opaque = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 128) continue;
      opaque += 1;
      // >=250 rather than exactly 255: antialiased edge pixels composite to
      // 254 and that is fine. What must never appear is the source purple
      // (153,51,204), which this comfortably excludes.
      expect(Math.min(data[i], data[i + 1], data[i + 2])).toBeGreaterThanOrEqual(250);
    }
    // Guard against a silently empty image passing the loop vacuously.
    expect(opaque).toBeGreaterThan(1000);
  });

  it('preserves the shape, not just the colour', () => {
    // Knocking out must not fill the whole square -- the silhouette is
    // carried entirely by the alpha channel.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createCanvas, Image } = require('canvas');
    const img = new Image();
    img.src = loadWhiteLogoPng()!;
    const canvas = createCanvas(img.width, img.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const { data } = ctx.getImageData(0, 0, img.width, img.height);

    let transparent = 0;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] < 128) transparent += 1;
    }
    expect(transparent).toBeGreaterThan(0);
  });

  it('is cached, so repeated renders do not recomposite', () => {
    expect(loadWhiteLogoPng()).toBe(loadWhiteLogoPng());
  });
});

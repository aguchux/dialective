import { readFileSync } from 'fs';
import { join } from 'path';

let cachedLogo: Buffer | null | undefined;

/**
 * Resolves the Dialect Library logo PNG for embedding in generated PDFs.
 * Same mounted-directory-first/Docker-bundled-fallback lookup as
 * AssistantService.readKnowledgeFile, applied to a binary asset instead of a
 * knowledge document -- __dirname resolves to dist/common at runtime (so
 * '../assets/logo-mark.png' is dist/assets/logo-mark.png, matching the
 * Dockerfile's COPY --from=build .../_assets ./services/api/dist/assets),
 * and the repo-root candidate supports local development without a build
 * step. Returns null (never throws) if the asset can't be found -- a missing
 * logo should degrade a generated PDF, not break it.
 */
export function loadLogoPng(): Buffer | null {
  if (cachedLogo !== undefined) return cachedLogo;
  const candidates = [
    join(__dirname, '..', 'assets', 'logo-mark.png'),
    join(process.cwd(), '..', '..', '_assets', 'logo-mark.png'),
  ];
  for (const path of candidates) {
    try {
      cachedLogo = readFileSync(path);
      return cachedLogo;
    } catch {
      // Try the next deterministic location.
    }
  }
  cachedLogo = null;
  return cachedLogo;
}

let cachedWhiteLogo: Buffer | null | undefined;

/**
 * The logo mark knocked out in white, for drawing on a dark surface.
 *
 * The shipped asset is a purple silhouette (rgb(153,51,204)) on
 * transparency, designed for light backgrounds. Drawn as-is on the VDCL
 * documents' accent masthead it is purple on purple and all but vanishes --
 * which is exactly how it first rendered there.
 *
 * The shape lives entirely in the alpha channel, so compositing white
 * through it with `source-in` produces a clean knockout. Doing that here
 * rather than shipping a second asset file means there is no light/dark
 * pair to drift apart, and the PDF renderer -- which cannot composite --
 * gets a ready-made white PNG instead of needing its own path.
 *
 * `canvas` is required lazily, matching every other consumer: it is a
 * native module, and a missing build must fail at the route that needs it
 * rather than at application boot. Returns null (never throws) when the
 * asset or the module is unavailable, so a missing logo degrades a document
 * rather than breaking it.
 */
export function loadWhiteLogoPng(): Buffer | null {
  if (cachedWhiteLogo !== undefined) return cachedWhiteLogo;
  const source = loadLogoPng();
  if (!source) {
    cachedWhiteLogo = null;
    return cachedWhiteLogo;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createCanvas, Image } = require('canvas');
    const img = new Image();
    img.src = source;
    const canvas = createCanvas(img.width, img.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, img.width, img.height);
    cachedWhiteLogo = canvas.toBuffer('image/png');
  } catch {
    cachedWhiteLogo = null;
  }
  // Narrow away the `undefined` sentinel: every path above has assigned.
  return cachedWhiteLogo ?? null;
}

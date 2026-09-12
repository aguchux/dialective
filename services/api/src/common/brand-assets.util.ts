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

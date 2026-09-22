import { createHash } from 'crypto';

/**
 * The canonical form a VDCL manifest is hashed over.
 *
 * This hash is asserted by the PDF, by the QR verification payload and by
 * any subscriber checking provenance. It has to mean the same thing years
 * after issuance, on a different machine, from a database that has since
 * gained columns. So the canonical form is defined HERE, explicitly, rather
 * than being "whatever JSON.stringify did that day":
 *
 * - Keys are sorted, so object key order cannot change the hash.
 * - Items are sorted by recordingId, so query order cannot change it.
 * - Only the fields listed below participate. Adding a column to
 *   VdclManifest does NOT change existing hashes.
 * - Numbers are serialised as strings at fixed precision, because a Decimal
 *   read back through a different driver may stringify differently.
 *
 * CANONICAL_VERSION is embedded in the hashed payload. If the rules above
 * ever have to change, the version bumps and old hashes stay verifiable
 * under the old rules -- which is the entire point of writing it down.
 */
export const CANONICAL_VERSION = 1;

export interface CanonicalManifestItem {
  recordingId: string;
  durationMs: number | null;
  dialectTag: string;
  compositeScore: string | null;
  score: string | null;
  hasTranscript: boolean;
}

export interface CanonicalManifest {
  manifestKey: string;
  licenceKey: string;
  version: number;
  contributorId: string;
  dialectTag: string;
  countryId: string | null;
  recordingCount: number;
  totalDurationMs: string;
  transcriptCount: number;
  excludedCount: number;
  meanCompositeScore: string | null;
  asrPipelineVersion: string | null;
  qualityPipelineVersion: string | null;
  purposes: string[];
  items: CanonicalManifestItem[];
}

/**
 * Serialise with sorted keys at every level.
 *
 * Deliberately hand-rolled rather than pulling in a canonical-JSON package:
 * this function's output is load-bearing for the life of every licence ever
 * issued, and a dependency bump that changed its behaviour would silently
 * invalidate documents already in the world.
 */
function canonicalStringify(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error('Refusing to canonicalise a non-finite number');
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalStringify).join(',')}]`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalStringify(v)}`)
      .join(',')}}`;
  }
  throw new Error(`Refusing to canonicalise unsupported type ${typeof value}`);
}

/**
 * Build the hashed payload by picking each field EXPLICITLY.
 *
 * Deliberately not a spread of the input. A spread would carry whatever
 * extra properties the caller happened to pass -- so the day someone adds a
 * column to VdclManifest and widens the interface, every hash silently
 * changes and every document already issued fails verification. Naming the
 * fields means that widening is a no-op here until someone chooses
 * otherwise, and then bumps CANONICAL_VERSION to say so.
 */
export function canonicalise(manifest: CanonicalManifest): string {
  const items = [...manifest.items]
    .sort((a, b) => (a.recordingId < b.recordingId ? -1 : a.recordingId > b.recordingId ? 1 : 0))
    .map((item) => ({
      recordingId: item.recordingId,
      durationMs: item.durationMs,
      dialectTag: item.dialectTag,
      compositeScore: item.compositeScore,
      score: item.score,
      hasTranscript: item.hasTranscript,
    }));

  return canonicalStringify({
    canonicalVersion: CANONICAL_VERSION,
    manifestKey: manifest.manifestKey,
    licenceKey: manifest.licenceKey,
    version: manifest.version,
    contributorId: manifest.contributorId,
    dialectTag: manifest.dialectTag,
    countryId: manifest.countryId,
    recordingCount: manifest.recordingCount,
    totalDurationMs: manifest.totalDurationMs,
    transcriptCount: manifest.transcriptCount,
    excludedCount: manifest.excludedCount,
    meanCompositeScore: manifest.meanCompositeScore,
    asrPipelineVersion: manifest.asrPipelineVersion,
    qualityPipelineVersion: manifest.qualityPipelineVersion,
    purposes: [...manifest.purposes].sort(),
    items,
  });
}

export function hashManifest(manifest: CanonicalManifest): string {
  return createHash('sha256').update(canonicalise(manifest), 'utf8').digest('hex');
}

/**
 * Format a score to the schema's own precision (Decimal(5,2)).
 *
 * Going through the column's declared scale means a value hashed before a
 * round-trip matches the same value hashed after one -- otherwise a
 * verification run reading from Postgres could disagree with the hash
 * written at compile time.
 */
export function canonicalDecimal(value: { toString(): string } | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const n = Number(value.toString());
  if (!Number.isFinite(n)) return null;
  return n.toFixed(2);
}

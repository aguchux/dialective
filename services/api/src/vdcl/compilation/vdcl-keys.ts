/**
 * Licence and manifest identifiers.
 *
 *   Licence:  VDCL-{COUNTRY}-{CONTRIBUTOR_SHORT_ID}
 *   Manifest: VDM-{COUNTRY}-{CONTRIBUTOR_SHORT_ID}-{VERSION}
 *
 * There is deliberately NO dialect segment, though the product plan's
 * section 9.2 originally specified one. A licence covers every dialect its
 * contributor records in, so a dialect in the key would be a claim about
 * scope that the key cannot keep true: a contributor who signs covering
 * Igbo and later records Pidgin would need the key to change, and any
 * certificate already printed would then carry an identifier that no longer
 * matches. The dialects covered live on each version's manifest
 * (VdclManifest.dialectTags), where they can be stated accurately per
 * version without the identifier ever going stale.
 *
 * The contributor short id is derived from the contributor's uuid rather
 * than being a counter: a sequential id would leak how many contributors
 * Dialect Library has and where a given one sits in that order, which is
 * commercial information printed on a document that may be shown to a
 * subscriber.
 *
 * It is NOT anonymising on its own -- it is stable and derived, so anyone
 * holding the uuid can recompute it. It exists so the key is short and
 * readable, and the anonymity guarantee is enforced by which surfaces are
 * allowed to display a licence key at all, not by this string being opaque.
 */
export function contributorShortId(userId: string): string {
  return userId.replace(/-/g, '').slice(0, 8).toUpperCase();
}

function segment(value: string | null | undefined): string {
  const cleaned = (value ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return cleaned.length > 0 ? cleaned : 'GEN';
}

export function buildLicenceKey(params: {
  countryCode?: string | null;
  contributorId: string;
}): string {
  return `VDCL-${segment(params.countryCode)}-${contributorShortId(params.contributorId)}`;
}

export function buildManifestKey(params: {
  countryCode?: string | null;
  contributorId: string;
  version: number;
}): string {
  return `VDM-${segment(params.countryCode)}-${contributorShortId(params.contributorId)}-${
    params.version
  }`;
}

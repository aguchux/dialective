/**
 * Licence and manifest identifiers, per the product plan section 9.2.
 *
 *   Licence:  VDCL-{COUNTRY}-{DIALECT}-{CONTRIBUTOR_SHORT_ID}
 *   Manifest: VDM-{COUNTRY}-{DIALECT}-{CONTRIBUTOR_SHORT_ID}-{VERSION}
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
  dialectTag: string;
  contributorId: string;
}): string {
  return `VDCL-${segment(params.countryCode)}-${segment(params.dialectTag)}-${contributorShortId(
    params.contributorId,
  )}`;
}

export function buildManifestKey(params: {
  countryCode?: string | null;
  dialectTag: string;
  contributorId: string;
  version: number;
}): string {
  return `VDM-${segment(params.countryCode)}-${segment(params.dialectTag)}-${contributorShortId(
    params.contributorId,
  )}-${params.version}`;
}

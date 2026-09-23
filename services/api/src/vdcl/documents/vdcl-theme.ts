/**
 * The one palette both licence documents render from.
 *
 * The PDF and the PNG are two views of the same instrument, and a
 * contributor sees them side by side -- so they have to agree. They
 * previously each declared their own constants, which had already drifted:
 * both used the right accent purple, but ink/muted/line were #111111,
 * #666666 and #e3e3e8, none of which are the values the site actually
 * uses. The documents looked subtly unlike the product that issued them.
 *
 * These are lifted from frontend/app/globals.css (the light-theme :root
 * block) rather than approximated. A document is printed and archived, so
 * it always renders in the light palette -- there is no dark variant here,
 * deliberately.
 *
 * GREEN IS NOT DECORATION. The accent is purple, matching the brand
 * everywhere else. Green appears only where it means "this licence is in
 * force and verified" -- the status badge when ACTIVE, the verification
 * seal, the countersignature mark. A suspended or withdrawn licence must
 * never render green, or the colour stops carrying information and starts
 * being trim.
 */

/** Site tokens -- keep in step with globals.css :root. */
export const ACCENT = '#6a18a8';
export const ACCENT_DARK = '#4f1080';
export const ACCENT_SOFT = '#e8dcf5';
export const INK = '#1f1929';
export const MUTED = '#675d75';
export const LINE = '#ded4ea';
export const SURFACE = '#ffffff';
export const SURFACE_MUTED = '#f0eaf7';

/**
 * Verified green. Reserved for in-force status and verification marks.
 * GREEN_SOFT is the tint behind the seal; GREEN_DARK is for text on a
 * light tint, where the mid green would not carry enough contrast.
 */
export const GREEN = '#0f7a3d';
export const GREEN_DARK = '#0a5a2c';
export const GREEN_SOFT = '#e3f4e9';

/** Non-green outcomes. A licence that is not in force must not look as if it is. */
export const WARNING = '#b45309';
export const DANGER = '#b91c1c';
export const NEUTRAL = '#525252';

/**
 * The colour a status renders in, shared by both documents so a licence
 * cannot show as green on the certificate and amber on the PDF.
 */
export function statusColour(status: string): string {
  switch (status) {
    case 'ACTIVE':
      return GREEN;
    case 'SUSPENDED':
      return WARNING;
    case 'WITHDRAWN':
    case 'REJECTED':
      return DANGER;
    case 'SUPERSEDED':
      return NEUTRAL;
    default:
      // Anything in flight (draft, pending review, pending countersignature)
      // is not in force, so it takes the neutral tone rather than falling
      // through to a colour that implies it is.
      return MUTED;
  }
}

/** True only when the licence is actually in force -- gates every green mark. */
export function isInForce(status: string): boolean {
  return status === 'ACTIVE';
}

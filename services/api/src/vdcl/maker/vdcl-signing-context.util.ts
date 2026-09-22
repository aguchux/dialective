import { hashContext } from '../../otp/otp.util';

/**
 * Binds a signing OTP to the EXACT manifest being signed.
 *
 * This is the mechanism behind Phase 3's acceptance criterion -- "material
 * changes require a new signed version". The step-up code is issued against
 * a specific manifest hash, and consumed against the hash re-read from the
 * row at signing time. If the dataset changed in between, the hashes differ,
 * verification fails closed, and the signature cannot land on a document
 * the contributor never saw.
 *
 * The purposes are bound too. A contributor reviewing a licence granting
 * ASR training only must not have that code complete a signature on one
 * that also grants redistribution.
 *
 * Key order is fixed here rather than at call sites so hashContext's
 * JSON.stringify output is deterministic however a caller builds the object.
 */
export function vdclSigningContextHash(input: {
  versionId: string;
  manifestHash: string;
  purposes: string[];
}): string {
  return hashContext({
    versionId: input.versionId,
    manifestHash: input.manifestHash,
    // Sorted so the order the grants happen to be read in cannot change the
    // hash and silently invalidate a legitimate code.
    purposes: [...input.purposes].sort().join(','),
  });
}

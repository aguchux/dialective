/**
 * KYC statuses that block a withdrawal at ANY amount.
 *
 * A resolved negative verdict is different from "hasn't finished yet": the
 * token threshold only exempts a user who simply has not completed KYC, never
 * one Didit has already declined, expired or abandoned.
 *
 * Shared rather than duplicated because the royalty payout rail must gate
 * identically to the wallet rail. A contributor who has to verify their
 * identity to withdraw DL they earned by recording must also verify it to
 * withdraw DL they earned by being streamed -- if the two lists could drift,
 * the softer rail becomes an obvious route around the harder one.
 */
export const REJECTED_KYC_STATUSES: ReadonlySet<string> = new Set([
  'DECLINED',
  'ABANDONED',
  'EXPIRED',
]);

/** True when this status blocks a withdrawal regardless of amount. */
export function isRejectedKycStatus(kycStatus: string): boolean {
  return REJECTED_KYC_STATUSES.has(kycStatus);
}

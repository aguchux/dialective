import { hashContext } from '../otp/otp.util';

/**
 * Binds a withdrawal/deposit OTP to the exact transaction details it was
 * issued for -- both the /otp request route and the executing route call
 * this with the same fields, so the two can never drift. Key order is fixed
 * here (not left to call sites) so hashContext's JSON.stringify output is
 * deterministic regardless of how a caller happens to build the object.
 */
export function withdrawalContextHash(input: { tokenAmount: number; destinationAddress: string }): string {
  return hashContext({ tokenAmount: input.tokenAmount, destinationAddress: input.destinationAddress });
}

export function depositContextHash(input: { usdAmount: number; currency: string }): string {
  return hashContext({ usdAmount: input.usdAmount, currency: input.currency });
}

/**
 * Binds an admin-payout OTP (admin/training-payouts, admin/withdrawals/:id/
 * resolve) to the exact action being confirmed -- same anti-replay reasoning
 * as withdrawal/deposit binding, but scoped to whichever admin action is
 * being gated. `action` disambiguates which admin route the hash is for, so
 * a code issued for one action type can't validate another.
 */
export function adminActionContextHash(
  input:
    | { action: 'resolve-withdrawal'; id: string }
    | { action: 'training-payout'; userId: string; tokenAmount: number; reference: string },
): string {
  return hashContext(input);
}

import { hashContext } from '../otp/otp.util';

/**
 * Binds a withdrawal/deposit OTP to the exact transaction details it was
 * issued for -- both the /otp request route and the executing route call
 * this with the same fields, so the two can never drift. Key order is fixed
 * here (not left to call sites) so hashContext's JSON.stringify output is
 * deterministic regardless of how a caller happens to build the object.
 */
export function withdrawalContextHash(input: {
  tokenAmount: number;
  destinationAddress: string;
  destinationCurrency: string;
  destinationNetwork: string;
}): string {
  return hashContext({
    tokenAmount: input.tokenAmount,
    destinationAddress: input.destinationAddress,
    destinationCurrency: input.destinationCurrency,
    destinationNetwork: input.destinationNetwork,
  });
}

export function depositContextHash(input: { usdAmount: number; currency: string }): string {
  return hashContext({ usdAmount: input.usdAmount, currency: input.currency });
}

/**
 * Fiat-withdrawal counterpart to withdrawalContextHash -- binds to
 * tokenAmount + payoutAccountId instead of a freshly-typed destination
 * address/currency/network, since a fiat withdrawal references a saved
 * PayoutAccount rather than accepting destination details inline.
 */
export function fiatWithdrawalContextHash(input: {
  tokenAmount: number;
  payoutAccountId: string;
}): string {
  return hashContext({ tokenAmount: input.tokenAmount, payoutAccountId: input.payoutAccountId });
}

/**
 * Binds a payout-account-deletion OTP to the exact account being deleted --
 * both the /otp request route and the executing DELETE route call this with
 * the same payoutAccountId, so a code issued to confirm deleting one account
 * can't be replayed against a different one.
 */
export function payoutAccountDeleteContextHash(input: { payoutAccountId: string }): string {
  return hashContext({ payoutAccountId: input.payoutAccountId });
}

/**
 * Binds a STABLECOIN_WALLET setup OTP to the exact address/asset/network
 * being saved -- unlike BANK/MOBILE_MONEY (provider-verified or
 * unverified-by-design) or STRIPE_CONNECT (Stripe's own hosted onboarding
 * confirms it), a trainer-typed wallet address has no external verification
 * step, so this OTP is the only confirmation that the trainer actually
 * intended to save and lock this exact address before it becomes their
 * permanent payout destination.
 */
export function stablecoinWalletSetupContextHash(input: {
  walletAddress: string;
  stablecoinAsset: string;
  stablecoinNetwork: string;
}): string {
  return hashContext({
    walletAddress: input.walletAddress,
    stablecoinAsset: input.stablecoinAsset,
    stablecoinNetwork: input.stablecoinNetwork,
  });
}

/**
 * Binds an admin-payout OTP (admin/training-payouts, admin/withdrawals/:id/
 * approve|resolve|submit-nowpayments) to the exact action AND the exact
 * transaction details being confirmed -- same anti-replay reasoning as
 * withdrawal/deposit binding, but scoped to whichever admin action is being
 * gated. `action` disambiguates which admin route the hash is for, so a code
 * issued for one action type can't validate another.
 *
 * The withdrawal variant binds id/amount/currency/address/network (not just
 * id) so an OTP issued for a withdrawal can only ever authorize sending
 * funds to the exact destination/amount it was shown for -- if any of those
 * fields change on the row between OTP issuance and consumption (e.g. an
 * admin edits the note, or -- hypothetically -- the address), the hash
 * re-derived from the current row no longer matches and verification fails
 * closed rather than silently authorizing a different payout.
 */
export function adminActionContextHash(
  input:
    | {
        action: 'withdrawal';
        id: string;
        tokenAmount: number;
        destinationCurrency: string;
        destinationAddress: string;
        destinationNetwork: string;
      }
    | { action: 'training-payout'; userId: string; tokenAmount: number; reference: string }
    | { action: 'admin-wallet-adjustment'; userId: string; tokenAmount: number; reference: string }
    | { action: 'user-lock'; userId: string; status: string }
    | { action: 'user-delete'; userId: string }
    | { action: 'account-close'; userId: string }
    | { action: 'sub-distributor-adjustment'; userId: string; amount: number; reference: string }
    | {
        action: 'recording-audit-clawback';
        kind: 'word';
        recordingId: string;
        tokenAmount: number;
      }
    | { action: 'audit-hold-release'; userId: string }
    | { action: 'phone-verification-revoke'; userId: string },
): string {
  return hashContext(input);
}

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
 * Generalized payout-account-setup OTP binding, covering every account type
 * -- previously only STABLECOIN_WALLET required this OTP (a trainer-typed
 * wallet address has no external verification step, unlike BANK/
 * MOBILE_MONEY's Flutterwave resolve or STRIPE_CONNECT's hosted
 * onboarding); now every type requires it, confirming the trainer actually
 * intended to save exactly this destination. Binds to whichever fields
 * identify the destination being saved, so a code shown for one exact
 * account can't be replayed to confirm a different one. `type`
 * disambiguates the variant the same way adminActionContextHash's `action`
 * does.
 */
export function payoutAccountSetupContextHash(
  input:
    | { type: 'BANK'; bankCode: string; accountNumber: string; freeEntry: false }
    | { type: 'BANK'; bankName: string; accountNumber: string; freeEntry: true }
    | {
        type: 'MOBILE_MONEY';
        mobileMoneyNetwork: string;
        mobileMoneyNumber: string;
        freeEntry: boolean;
      }
    | {
        type: 'STABLECOIN_WALLET';
        walletAddress: string;
        stablecoinAsset: string;
        stablecoinNetwork: string;
      },
): string {
  const { type } = input;
  if (type === 'BANK') {
    // Free-entry has no bankCode (it's a typed name, not a catalog pick) --
    // binds bankName instead, so a code issued for one typed name/account
    // number can't be replayed against a different one.
    return input.freeEntry
      ? hashContext({
          type,
          bankName: input.bankName,
          accountNumber: input.accountNumber,
          freeEntry: 'true',
        })
      : hashContext({
          type,
          bankCode: input.bankCode,
          accountNumber: input.accountNumber,
          freeEntry: 'false',
        });
  }
  if (type === 'MOBILE_MONEY') {
    return hashContext({
      type,
      mobileMoneyNetwork: input.mobileMoneyNetwork,
      mobileMoneyNumber: input.mobileMoneyNumber,
      freeEntry: String(input.freeEntry),
    });
  }
  return hashContext({
    type,
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
    // Switching the stake-and-payout training economy on or off platform-wide.
    // Binds the DIRECTION, not just the action: a code issued to switch the
    // economy OFF must not be replayable to switch it back ON, which would
    // silently resume creating withdrawal liabilities.
    | { action: 'training-economy-toggle'; direction: 'enable' | 'disable' }
    | { action: 'phone-verification-revoke'; userId: string }
    // Countersigning a VDCL grants commercial rights over a real person's
    // voice, which is why it joins the step-up set. It binds the MANIFEST
    // HASH, not just the version id: an admin confirming a licence over
    // 4,000 clips must not have that code complete a countersignature over
    // a different dataset if the manifest changed between issuing the code
    // and using it.
    | { action: 'vdcl-countersign'; versionId: string; manifestHash: string }
    // The rest of the licence screen. Suspending, reinstating, revoking a
    // countersignature, recording a withdrawal and re-issuing documents
    // were each a single unconfirmed click, and all of them either stop a
    // contributor's work reaching subscribers or change what their
    // certificate verifies against. Bound to the action AND its target, so
    // a code issued to suspend one licence cannot withdraw another, and a
    // code issued to suspend cannot be replayed to revoke.
    | {
        action:
          | 'vdcl-suspend'
          | 'vdcl-reinstate'
          | 'vdcl-revoke'
          | 'vdcl-withdraw'
          | 'vdcl-reissue';
        targetId: string;
      },
): string {
  return hashContext(input);
}

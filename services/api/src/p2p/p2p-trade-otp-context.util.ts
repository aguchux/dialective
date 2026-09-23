import { hashContext } from '../otp/otp.util';

/**
 * Binds a trading OTP (used only while PlatformSettings.phoneVerificationRequired
 * is off, replacing the standing phone-verified gate for offer create/accept
 * -- see P2pService.requireVerifiedForTrading) to the exact action and trade
 * details it was issued for, same anti-replay reasoning as
 * withdrawalContextHash/paymentMethodContextHash. A code issued for one
 * offer's terms can never authorize creating/accepting a different one.
 */
export function p2pTradeOtpContextHash(
  input:
    | {
        action: 'create-offer';
        type: string;
        tokenAmount: number;
        fiatCurrency: string;
        paymentMethod: string;
        paymentMethodIds?: string[];
      }
    | { action: 'accept-offer'; offerId: string },
): string {
  return hashContext(input);
}

/**
 * Binds an admin force-resolution OTP to the exact stuck trade and the
 * escrow amount being moved.
 *
 * Separate from adminActionContextHash's set only because this lives in the
 * P2P module and binds P2P-shaped fields; the reasoning is identical. It
 * binds `tokenAmount` as well as the trade id so a code issued after
 * reading one trade's escrow can never complete a resolution over a
 * different figure -- the amount is what the admin actually weighed when
 * deciding, and it is what moves.
 */
export function p2pAdminForceResolveContextHash(input: {
  tradeId: string;
  outcome: 'refund-seller' | 'release-buyer';
  tokenAmount: string;
}): string {
  return hashContext({
    action: 'p2p-admin-force-resolve',
    tradeId: input.tradeId,
    outcome: input.outcome,
    tokenAmount: input.tokenAmount,
  });
}

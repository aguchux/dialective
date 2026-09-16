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

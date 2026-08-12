import { hashContext } from '../otp/otp.util';

/** Binds a PHONE_VERIFICATION OTP to the exact number it was issued for -- same anti-replay reasoning as withdrawalContextHash/paymentMethodContextHash. */
export function phoneVerificationContextHash(phoneNumber: string): string {
  return hashContext({ phoneNumber });
}

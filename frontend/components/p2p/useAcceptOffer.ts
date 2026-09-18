'use client';

import { useState } from 'react';
import {
  P2POffer,
  P2PTrade,
  normalizeErrorMessage,
  useAcceptP2POfferMutation,
  useGetPlatformSettingsQuery,
  useListPayoutAccountsQuery,
  useRequestP2PTradeOtpMutation,
} from '@/store/api';

/**
 * The single implementation of "commit to this offer".
 *
 * It used to live only in MarketView, and the offer detail page reached it
 * by navigating to /dashboard/markets?accept=<id> so the OTP challenge, the
 * multi-account picker and the phone-verification gate would not be written
 * twice. That hand-off was the bug: the effect consuming the param stripped
 * it from the URL before its offer fetch resolved, which flipped its own
 * dependency, ran its cleanup and cancelled the accept before it ever fired.
 * The button looked dead and no trade was created.
 *
 * Sharing the logic as a hook gets the same no-drift guarantee without a
 * cross-page navigation carrying intent in a query string: the detail page
 * now accepts in place and routes to the resulting trade.
 */
export function useAcceptOffer({ onAccepted }: { onAccepted?: (trade: P2PTrade) => void } = {}) {
  const [acceptOffer, { isLoading: accepting }] = useAcceptP2POfferMutation();
  const [requestTradeOtp] = useRequestP2PTradeOtpMutation();
  const { data: platformSettings } = useGetPlatformSettingsQuery();
  const { data: payoutAccounts = [] } = useListPayoutAccountsQuery();

  const [error, setError] = useState('');
  const [otpRequestId, setOtpRequestId] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState('');
  const [pendingOffer, setPendingOffer] = useState<P2POffer | null>(null);
  // Set when a SELL offer lists more than one receive-account -- the buyer
  // must pick which one they'll pay into before accepting proceeds (see
  // P2PService.acceptOffer's offer-listed-accounts validation).
  const [accountPickerOffer, setAccountPickerOffer] = useState<P2POffer | null>(null);
  const [chosenSellerPaymentMethodId, setChosenSellerPaymentMethodId] = useState<string | null>(
    null,
  );

  const phoneVerificationRequired = platformSettings?.phoneVerificationRequired ?? true;

  function methodIdFor(offer: P2POffer, chosen: string | null) {
    if (offer.type === 'SELL') {
      // Fall back to the offer's own single listed account rather than
      // sending nothing: the server rejects a BUY with no method, and for a
      // SELL an explicit id avoids depending on its default resolution.
      return chosen ?? offer.paymentMethods[0]?.id ?? undefined;
    }
    const currencyAccounts = payoutAccounts.filter(
      (account) => account.currency.toUpperCase() === offer.fiatCurrency.toUpperCase(),
    );
    return (currencyAccounts.find((account) => account.isDefault) ?? currencyAccounts[0])?.id;
  }

  async function accept(offer: P2POffer, chosen: string | null = chosenSellerPaymentMethodId) {
    setError('');
    if (offer.type === 'SELL' && offer.paymentMethods.length > 1 && !chosen) {
      setAccountPickerOffer(offer);
      return;
    }
    const sellerPaymentMethodId = methodIdFor(offer, chosen);
    if (!phoneVerificationRequired) {
      try {
        const otp = await requestTradeOtp({ action: 'accept-offer', offerId: offer.id }).unwrap();
        setOtpRequestId(otp.otpRequestId);
        setOtpCode('');
        setPendingOffer(offer);
      } catch (err) {
        setError(normalizeErrorMessage(err, 'Could not send verification code'));
      }
      return;
    }
    try {
      const trade = await acceptOffer({ id: offer.id, sellerPaymentMethodId }).unwrap();
      setChosenSellerPaymentMethodId(null);
      onAccepted?.(trade);
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Could not accept offer'));
    }
  }

  async function confirmWithOtp() {
    if (!pendingOffer || !otpRequestId) return;
    setError('');
    try {
      const trade = await acceptOffer({
        id: pendingOffer.id,
        sellerPaymentMethodId: methodIdFor(pendingOffer, chosenSellerPaymentMethodId),
        otpRequestId,
        code: otpCode.trim(),
      }).unwrap();
      setPendingOffer(null);
      setOtpRequestId(null);
      setOtpCode('');
      setChosenSellerPaymentMethodId(null);
      onAccepted?.(trade);
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Could not verify this code'));
    }
  }

  function closeAccountPicker() {
    setAccountPickerOffer(null);
    setChosenSellerPaymentMethodId(null);
  }

  function closeOtp() {
    setPendingOffer(null);
    setOtpRequestId(null);
    setOtpCode('');
    setChosenSellerPaymentMethodId(null);
  }

  return {
    accept,
    accepting,
    error,
    setError,
    accountPickerOffer,
    closeAccountPicker,
    chosenSellerPaymentMethodId,
    setChosenSellerPaymentMethodId,
    pendingOffer,
    closeOtp,
    otpCode,
    setOtpCode,
    confirmWithOtp,
  };
}

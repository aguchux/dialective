'use client';

import { ActionButton } from '@/components/ui/ActionButton';
import { Dialog, DialogContent } from '@/components/ui/Dialog';
import type { useAcceptOffer } from '@/components/p2p/useAcceptOffer';

/**
 * The account picker and OTP challenge that can interrupt an accept,
 * rendered from the shared useAcceptOffer state so the market table and the
 * offer detail page show the identical steps.
 */
export function AcceptOfferDialogs({ flow }: { flow: ReturnType<typeof useAcceptOffer> }) {
  return (
    <>
      {flow.accountPickerOffer && (
        <Dialog open onOpenChange={(open) => !open && flow.closeAccountPicker()}>
          <DialogContent
            title="Choose payment account"
            description="This seller accepts payment to more than one account -- pick which one you'll pay."
          >
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                {flow.accountPickerOffer.paymentMethods.map((method) => (
                  <label
                    className="flex items-center gap-2 rounded-lg border border-line bg-bg px-3 py-2 text-sm font-bold"
                    key={method.id}
                  >
                    <input
                      checked={flow.chosenSellerPaymentMethodId === method.id}
                      name="seller-payment-method"
                      onChange={() => flow.setChosenSellerPaymentMethodId(method.id)}
                      type="radio"
                    />
                    {method.label}
                    {!method.verified && (
                      <span className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-xs font-black text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                        Unverified
                      </span>
                    )}
                  </label>
                ))}
              </div>
              {flow.error && <p className="text-sm font-bold text-danger">{flow.error}</p>}
              <ActionButton
                className="min-h-11 rounded-lg bg-accent px-4 font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!flow.chosenSellerPaymentMethodId}
                onClick={() => {
                  const offer = flow.accountPickerOffer;
                  const chosen = flow.chosenSellerPaymentMethodId;
                  flow.closeAccountPicker();
                  // Pass the choice explicitly: closeAccountPicker clears it
                  // from state, and this render's value is what the buyer
                  // actually picked.
                  if (offer) void flow.accept(offer, chosen);
                }}
                pending={flow.accepting}
                pendingLabel="Continuing"
                type="button"
              >
                Continue
              </ActionButton>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {flow.pendingOffer && (
        <Dialog open onOpenChange={(open) => !open && flow.closeOtp()}>
          <DialogContent
            title="Confirm this trade"
            description="We emailed a 6-digit code to confirm this trade."
          >
            <div className="grid gap-3">
              <label className="grid gap-1.5 text-sm font-bold">
                Email verification code
                <input
                  autoFocus
                  className="min-h-11 rounded-lg border border-line bg-bg px-3"
                  inputMode="numeric"
                  maxLength={6}
                  onChange={(e) => flow.setOtpCode(e.target.value)}
                  value={flow.otpCode}
                />
              </label>
              {flow.error && <p className="text-sm font-bold text-danger">{flow.error}</p>}
              <ActionButton
                className="min-h-11 rounded-lg bg-accent px-4 font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!flow.otpCode.trim()}
                onClick={() => void flow.confirmWithOtp()}
                pending={flow.accepting}
                pendingLabel="Confirming"
                type="button"
              >
                Confirm
              </ActionButton>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

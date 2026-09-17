import { Breadcrumbs } from '@/components/Breadcrumbs';
import { LandingFooter } from '@/components/landing/LandingFooter';
import { LandingHeader } from '@/components/landing/LandingHeader';
import { ParallaxTopBackground } from '@/components/ParallaxTopBackground';

export const metadata = {
  title: 'Refund Policy',
  description: 'How refunds, reversals, and payment disputes are handled on Dialect Library.',
};

const LAST_UPDATED = 'September 9, 2026';

export default function RefundsPage() {
  return (
    <main className="relative isolate min-h-screen overflow-hidden bg-white text-[#050505]">
      <ParallaxTopBackground />
      <LandingHeader />
      <div className="relative z-10 mx-auto grid max-w-3xl gap-6 px-4 py-6 md:px-8">
        <Breadcrumbs items={[{ label: 'Refund Policy' }]} />
        <section className="grid gap-3 rounded-lg border border-line bg-surface p-5">
          <p className="text-sm font-extrabold uppercase text-accent">Legal</p>
          <h1 className="text-4xl font-black leading-tight">Refund Policy</h1>
          <p className="max-w-2xl leading-relaxed text-muted">Last updated {LAST_UPDATED}.</p>
        </section>

        <article className="grid gap-6 leading-relaxed text-[rgba(5,5,5,0.78)]">
          <section className="grid gap-2">
            <h2 className="text-xl font-black text-[#050505]">1. Scope</h2>
            <p>
              This policy explains how Dialect Library handles refunds and payment reversals for
              platform funding, withdrawals, peer-to-peer trades, and Voice Stream subscriptions. It
              should be read together with our Terms of Use. Where a third-party payment provider is
              involved, its terms may also apply.
            </p>
          </section>

          <section className="grid gap-2">
            <h2 className="text-xl font-black text-[#050505]">2. DL wallet funding</h2>
            <p>
              Confirmed funding is converted to internal DL at the rate shown by Dialect Library at
              checkout. Because a confirmed payment has been processed and credited to an account,
              it is normally non-refundable. If a payment was duplicated, credited to the wrong
              account because of a platform error, or confirmed for an amount different from the
              amount received, contact us promptly with the payment reference so we can investigate
              and correct the ledger where appropriate.
            </p>
            <p>
              A payment that is still pending, expired, rejected, or cancelled has not been credited
              as completed funding. Any provider-side refund for an unsuccessful payment is handled
              through the payment provider&apos;s settlement process.
            </p>
          </section>

          <section className="grid gap-2">
            <h2 className="text-xl font-black text-[#050505]">3. Withdrawals</h2>
            <p>
              A withdrawal request can be rejected before payout where it fails an eligibility,
              identity, account, or fraud review. When a withdrawal is rejected or fails before
              settlement, the DL reserved for that request is returned to the user wallet. Once a
              payout has been successfully sent to the destination supplied by the user, it cannot
              normally be recalled by Dialect Library. Network, bank, or provider fees may not be
              recoverable.
            </p>
          </section>

          <section className="grid gap-2">
            <h2 className="text-xl font-black text-[#050505]">4. P2P trades</h2>
            <p>
              P2P trades use platform escrow. A seller&apos;s DL remains locked until the seller
              confirms receipt of the buyer&apos;s payment, or until an authorised dispute decision
              resolves the trade. Cancelling a trade does not by itself create a refund entitlement
              for an off-platform payment. Users must use the trade payment notices, cancellation
              window, and dispute process and should not release funds outside the agreed flow.
            </p>
          </section>

          <section className="grid gap-2">
            <h2 className="text-xl font-black text-[#050505]">5. Voice Stream subscriptions</h2>
            <p>
              Voice Stream subscription fees are generally non-refundable after a billing period has
              started or the subscribed access has been used. Where required by applicable law, or
              where a charge was duplicated or made in error, we may issue a partial or full refund
              after reviewing the account and payment record. Cancellation normally stops the next
              renewal and does not automatically refund the current period.
            </p>
          </section>

          <section className="grid gap-2">
            <h2 className="text-xl font-black text-[#050505]">6. Requesting a review</h2>
            <p>
              Send refund or payment-correction requests to{' '}
              <a className="font-bold text-accent underline" href="mailto:hello@dialectlibrary.com">
                hello@dialectlibrary.com
              </a>{' '}
              with your account email, transaction or order reference, amount, date, and a short
              explanation. Do not send passwords, private keys, or full payment-card details. We may
              request additional information needed to verify the transaction.
            </p>
            <p>
              Approved refunds are returned through the original payment route where possible. The
              time for funds to appear depends on the relevant bank, card network, or payment
              provider.
            </p>
          </section>

          <section className="grid gap-2">
            <h2 className="text-xl font-black text-[#050505]">7. Changes</h2>
            <p>
              We may update this policy when our products, payment providers, or legal obligations
              change. The updated date at the top of this page shows when the current version took
              effect.
            </p>
          </section>
        </article>
      </div>
      <div className="relative z-10">
        <LandingFooter />
      </div>
    </main>
  );
}

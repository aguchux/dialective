import { Breadcrumbs } from '@/components/Breadcrumbs';
import { LandingFooter } from '@/components/landing/LandingFooter';
import { LandingHeader } from '@/components/landing/LandingHeader';
import { ParallaxTopBackground } from '@/components/ParallaxTopBackground';

export const metadata = {
  title: 'Privacy Policy',
  description: 'How Dialect Library collects, uses, and protects your personal data.',
};

const LAST_UPDATED = 'August 9, 2026';

export default function PrivacyPage() {
  return (
    <main className="relative isolate min-h-screen overflow-hidden bg-white text-[#050505]">
      <ParallaxTopBackground />
      <LandingHeader />
      <div className="relative z-10 mx-auto grid max-w-3xl gap-6 px-4 py-6 md:px-8">
        <Breadcrumbs items={[{ label: 'Privacy Policy' }]} />
        <section className="grid gap-3 rounded-lg border border-line bg-surface p-5">
          <p className="text-sm font-extrabold uppercase text-accent">Legal</p>
          <h1 className="text-4xl font-black leading-tight">Privacy Policy</h1>
          <p className="max-w-2xl leading-relaxed text-muted">Last updated {LAST_UPDATED}.</p>
        </section>

        <article className="grid gap-6 leading-relaxed text-[rgba(5,5,5,0.78)]">
          <section className="grid gap-2">
            <h2 className="text-xl font-black text-[#050505]">1. Overview</h2>
            <p>
              This Privacy Policy explains what personal data Dialect Library collects, why we
              collect it, and how it is used and protected. It applies to dialectlibrary.com and the
              Dialect Library trainer platform.
            </p>
          </section>

          <section className="grid gap-2">
            <h2 className="text-xl font-black text-[#050505]">2. Information we collect</h2>
            <p>When you create and use an account, we collect:</p>
            <ul className="ml-5 list-disc grid gap-1.5">
              <li>
                <span className="font-bold text-[#050505]">Account information</span> — your email
                address, a hashed password (if you use email/password sign-in), your account role
                and status, and your chosen country and dialect.
              </li>
              <li>
                <span className="font-bold text-[#050505]">Voice and translation submissions</span>{' '}
                — audio recordings and word translations you submit as a trainer, stored on our
                cloud storage provider (DigitalOcean Spaces).
              </li>
              <li>
                <span className="font-bold text-[#050505]">Wallet and transaction data</span> — your
                DL balance, ledger of deposits, withdrawals, and referral bonuses, and the
                destination wallet address you provide for withdrawals. Crypto deposits are
                processed by our payment processor, NOWPayments; we do not collect or store your
                card details, since deposits are made in USDC/USDT, not by card.
              </li>
              <li>
                <span className="font-bold text-[#050505]">Referral data</span> — your referral code
                and a record of which accounts registered using your referral link.
              </li>
              <li>
                <span className="font-bold text-[#050505]">Data-access requests</span> — if you
                submit our &quot;Subscribe to voice data&quot; form, we collect your name, email,
                organization, and stated use case.
              </li>
            </ul>
          </section>

          <section className="grid gap-2">
            <h2 className="text-xl font-black text-[#050505]">3. How we use your information</h2>
            <p>We use the information above to:</p>
            <ul className="ml-5 list-disc grid gap-1.5">
              <li>Create and secure your account, and verify your email.</li>
              <li>Build and license voice and dialect datasets from trainer submissions.</li>
              <li>Process wallet deposits and withdrawals and calculate referral bonuses.</li>
              <li>
                Send transactional emails — password resets, email verification, and magic-link
                sign-in.
              </li>
              <li>Respond to data-access requests from organizations.</li>
              <li>Detect and prevent fraud, including referral abuse.</li>
            </ul>
          </section>

          <section className="grid gap-2">
            <h2 className="text-xl font-black text-[#050505]">4. Who we share data with</h2>
            <p>We share limited data with the third-party services that power the platform:</p>
            <ul className="ml-5 list-disc grid gap-1.5">
              <li>
                <span className="font-bold text-[#050505]">NOWPayments</span> — to process crypto
                deposits. NOWPayments handles the payment itself; we never see your private keys.
              </li>
              <li>
                <span className="font-bold text-[#050505]">DigitalOcean Spaces</span> — to store
                voice recordings and word-recording audio you submit.
              </li>
              <li>
                <span className="font-bold text-[#050505]">Resend</span> — to deliver transactional
                emails (password reset, email verification, magic links, and data-access lead
                notifications).
              </li>
            </ul>
            <p>
              We do not sell your personal data, and we do not use third-party advertising or
              analytics trackers on this site.
            </p>
          </section>

          <section className="grid gap-2">
            <h2 className="text-xl font-black text-[#050505]">
              5. Voice and dialect data licensing
            </h2>
            <p>
              Voice recordings and word translations submitted by trainers may be included in
              datasets licensed to data subscribers (e.g. research or AI teams). Submissions are
              used for dataset purposes as described in our Terms of Use; we do not sell your
              personal account information as part of any dataset.
            </p>
          </section>

          <section className="grid gap-2">
            <h2 className="text-xl font-black text-[#050505]">6. Data retention</h2>
            <p>
              We retain account and submission data for as long as your account is active and as
              needed to maintain accurate wallet and referral records. Tokens used for
              authentication (refresh, password-reset, and email-verification tokens) are stored as
              one-way hashes, not in plaintext, and expire automatically.
            </p>
          </section>

          <section className="grid gap-2">
            <h2 className="text-xl font-black text-[#050505]">7. Your rights</h2>
            <p>
              You can review and update your profile information from your account, and you can
              request deletion of your account and associated personal data by contacting us. Some
              records — such as ledger entries needed for financial accuracy — may be retained as
              required by law even after account deletion.
            </p>
          </section>

          <section className="grid gap-2">
            <h2 className="text-xl font-black text-[#050505]">8. Security</h2>
            <p>
              Passwords are stored as salted hashes, never in plaintext. Authentication tokens are
              short-lived and rotated on use. Access to administrative functions is restricted to
              accounts with an admin role.
            </p>
          </section>

          <section className="grid gap-2">
            <h2 className="text-xl font-black text-[#050505]">9. Children&apos;s privacy</h2>
            <p>
              Dialect Library is not intended for use by anyone under 18. We do not knowingly
              collect data from minors.
            </p>
          </section>

          <section className="grid gap-2">
            <h2 className="text-xl font-black text-[#050505]">10. Changes to this policy</h2>
            <p>
              We may update this Privacy Policy from time to time. Material changes will be
              reflected by an updated date at the top of this page.
            </p>
          </section>

          <section className="grid gap-2">
            <h2 className="text-xl font-black text-[#050505]">11. Contact</h2>
            <p>
              Questions about this Privacy Policy, or requests about your data, can be sent to
              hello@dialectlibrary.com.
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

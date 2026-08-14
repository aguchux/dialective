import { Breadcrumbs } from '@/components/Breadcrumbs';
import { LandingFooter } from '@/components/landing/LandingFooter';
import { LandingHeader } from '@/components/landing/LandingHeader';
import { ParallaxTopBackground } from '@/components/ParallaxTopBackground';

export const metadata = {
  title: 'Terms of Use',
  description: 'The terms governing your use of Dialect Library as a trainer, referrer, or data subscriber.',
};

const LAST_UPDATED = 'August 9, 2026';

export default function TermsPage() {
  return (
    <main className="relative isolate min-h-screen overflow-hidden bg-white text-[#050505]">
      <ParallaxTopBackground />
      <LandingHeader />
      <div className="relative z-10 mx-auto grid max-w-3xl gap-6 px-4 py-6 md:px-8">
        <Breadcrumbs items={[{ label: 'Terms of Use' }]} />
        <section className="grid gap-3 rounded-lg border border-line bg-surface p-5">
          <p className="text-sm font-extrabold uppercase text-accent">Legal</p>
          <h1 className="text-4xl font-black leading-tight">Terms of Use</h1>
          <p className="max-w-2xl leading-relaxed text-muted">Last updated {LAST_UPDATED}.</p>
        </section>

        <article className="grid gap-6 leading-relaxed text-[rgba(5,5,5,0.78)]">
          <section className="grid gap-2">
            <h2 className="text-xl font-black text-[#050505]">1. Who we are</h2>
            <p>
              Dialect Library (&quot;Dialect Library,&quot; &quot;we,&quot; &quot;us&quot;) operates a crowdsourced voice
              and dialect data platform at dialectlibrary.com. Dialect Library is registered in the United Kingdom.
              These Terms of Use (&quot;Terms&quot;) govern your access to and use of the platform, including our
              website, trainer accounts, wallet and DL (token) features, and referral program.
            </p>
          </section>

          <section className="grid gap-2">
            <h2 className="text-xl font-black text-[#050505]">2. Eligibility</h2>
            <p>
              You must be at least 18 years old to create an account or use Dialect Library. By registering, you
              represent that you meet this requirement and that any information you provide is accurate.
            </p>
          </section>

          <section className="grid gap-2">
            <h2 className="text-xl font-black text-[#050505]">3. Accounts</h2>
            <p>
              You can create an account with an email and password, or sign in with a passwordless magic link sent to
              your email. You are responsible for keeping your login credentials secure and for all activity under
              your account. Every account is assigned a role (trainer, partner, or admin) and a status (active,
              suspended, or blocked); we may suspend or block accounts that violate these Terms, submit fraudulent
              data, or attempt to abuse the referral program.
            </p>
          </section>

          <section className="grid gap-2">
            <h2 className="text-xl font-black text-[#050505]">4. Trainer contributions</h2>
            <p>
              As a trainer, you may record voice prompts and submit word translations in your chosen dialect. By
              submitting a recording or translation, you confirm that the content is your own original speech or
              translation, that you have the right to submit it, and you grant Dialect Library a non-exclusive,
              worldwide, royalty-free license to store, process, and use your submissions to build and license voice
              and dialect datasets. Submissions may be reviewed against other trainers in the same dialect before
              being used or counted toward any reward.
            </p>
          </section>

          <section className="grid gap-2">
            <h2 className="text-xl font-black text-[#050505]">5. Wallet, DL, and payments</h2>
            <p>
              Trainers may fund a platform wallet using USDC or USDT through our third-party payment processor,
              NOWPayments. Deposits are converted to internal DL (short for &quot;Dial,&quot; our token unit) at a
              fixed rate once payment is confirmed. DL is an internal unit of account on Dialect Library and is not a
              cryptocurrency, security, or transferable financial instrument outside the platform. Withdrawal requests
              are reviewed manually and paid out to the crypto wallet address you provide; we may reject a withdrawal
              request and reverse the associated DL debit at our discretion, including where we suspect fraud or
              abuse.
            </p>
          </section>

          <section className="grid gap-2">
            <h2 className="text-xl font-black text-[#050505]">6. Referral program</h2>
            <p>
              Every account receives a personal referral link. Referral bonuses, where enabled, are paid at rates set
              by Dialect Library and may change or be disabled at any time. Bonuses are paid only on legitimate,
              confirmed activity from real referred users — creating duplicate or fraudulent accounts to generate
              referral bonuses is prohibited and may result in forfeiture of bonuses and account suspension.
            </p>
          </section>

          <section className="grid gap-2">
            <h2 className="text-xl font-black text-[#050505]">7. Data subscribers</h2>
            <p>
              Organizations may express interest in licensing collected voice and dialect data through our
              data-access request form. Any resulting data license is governed by a separate agreement between
              Dialect Library and the subscriber, not by these Terms.
            </p>
          </section>

          <section className="grid gap-2">
            <h2 className="text-xl font-black text-[#050505]">8. Prohibited conduct</h2>
            <p>
              You may not submit recordings or translations that are not your own, impersonate another person,
              upload content that is unlawful or infringing, attempt to manipulate review or scoring, or use
              automated means to create accounts or submissions.
            </p>
          </section>

          <section className="grid gap-2">
            <h2 className="text-xl font-black text-[#050505]">9. Platform changes</h2>
            <p>
              Dialect Library is under active development. Features described on the site — including scoring,
              reward pools, and peer-to-peer DL resale — may not yet be fully available and are subject to change
              as the platform evolves.
            </p>
          </section>

          <section className="grid gap-2">
            <h2 className="text-xl font-black text-[#050505]">10. Disclaimers and limitation of liability</h2>
            <p>
              Dialect Library is provided &quot;as is&quot; without warranties of any kind. To the fullest extent
              permitted by law, Dialect Library is not liable for indirect, incidental, or consequential damages
              arising from your use of the platform, including losses related to DL balances or delayed
              withdrawals.
            </p>
          </section>

          <section className="grid gap-2">
            <h2 className="text-xl font-black text-[#050505]">11. Governing law</h2>
            <p>These Terms are governed by the laws of the United Kingdom.</p>
          </section>

          <section className="grid gap-2">
            <h2 className="text-xl font-black text-[#050505]">12. Changes to these Terms</h2>
            <p>
              We may update these Terms from time to time. Continued use of Dialect Library after changes take effect
              means you accept the updated Terms.
            </p>
          </section>

          <section className="grid gap-2">
            <h2 className="text-xl font-black text-[#050505]">13. Contact</h2>
            <p>Questions about these Terms can be sent to hello@dialectlibrary.com.</p>
          </section>
        </article>
      </div>
      <div className="relative z-10">
        <LandingFooter />
      </div>
    </main>
  );
}

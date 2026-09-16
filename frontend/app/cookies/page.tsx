import { Breadcrumbs } from '@/components/Breadcrumbs';
import { LandingFooter } from '@/components/landing/LandingFooter';
import { LandingHeader } from '@/components/landing/LandingHeader';
import { ParallaxTopBackground } from '@/components/ParallaxTopBackground';

export const metadata = {
  title: 'Cookie Policy',
  description: 'What cookies and local storage Dialect Library uses, and why.',
};

const LAST_UPDATED = 'September 16, 2026';

export default function CookiesPage() {
  return (
    <main className="relative isolate min-h-screen overflow-hidden bg-white text-[#050505]">
      <ParallaxTopBackground />
      <LandingHeader />
      <div className="relative z-10 mx-auto grid max-w-3xl gap-6 px-4 py-6 md:px-8">
        <Breadcrumbs items={[{ label: 'Cookie Policy' }]} />
        <section className="grid gap-3 rounded-lg border border-line bg-surface p-5">
          <p className="text-sm font-extrabold uppercase text-accent">Legal</p>
          <h1 className="text-4xl font-black leading-tight">Cookie Policy</h1>
          <p className="max-w-2xl leading-relaxed text-muted">Last updated {LAST_UPDATED}.</p>
        </section>

        <article className="grid gap-6 leading-relaxed text-[rgba(5,5,5,0.78)]">
          <section className="grid gap-2">
            <h2 className="text-xl font-black text-[#050505]">1. Our approach to cookies</h2>
            <p>
              Dialect Library keeps cookie use to the minimum needed to run the platform. We do not
              use advertising cookies. Where enabled, we use Google Analytics to understand how the
              site is used in aggregate — see section 2 for when this applies and how to avoid it.
            </p>
          </section>

          <section className="grid gap-2">
            <h2 className="text-xl font-black text-[#050505]">2. Cookies we use</h2>
            <ul className="ml-5 list-disc grid gap-1.5">
              <li>
                <span className="font-bold text-[#050505]">
                  Session cookie (strictly necessary)
                </span>{' '}
                — when you sign in, our authentication system sets a session cookie to keep you
                logged in and to identify your account role on subsequent requests. Without this
                cookie, you cannot stay signed in.
              </li>
              <li>
                <span className="font-bold text-[#050505]">Google Analytics (optional)</span> —
                where enabled, Google Analytics sets cookies to measure site usage (e.g. which pages
                are visited and how often). It is never loaded until you acknowledge the cookie
                notice shown on your first visit, and does not load at all if this feature is
                switched off.
              </li>
            </ul>
            <p>
              The session cookie is essential to the operation of the platform and cannot be
              disabled without disabling the ability to log in. Google Analytics is optional and
              only ever loads after you&apos;ve acknowledged the cookie notice.
            </p>
          </section>

          <section className="grid gap-2">
            <h2 className="text-xl font-black text-[#050505]">3. Local storage (not a cookie)</h2>
            <p>
              We also use your browser&apos;s local storage — not a cookie — to remember your
              light/dark theme preference. This stays on your device and is not sent to our servers.
            </p>
          </section>

          <section className="grid gap-2">
            <h2 className="text-xl font-black text-[#050505]">4. Third-party cookies</h2>
            <p>
              We do not embed third-party advertising or social-media tracking pixels on Dialect
              Library. Where Google Analytics is enabled (see section 2), it is a third-party
              analytics service operated by Google and covered by{' '}
              <a
                className="font-semibold text-accent underline underline-offset-2"
                href="https://policies.google.com/privacy"
                rel="noopener noreferrer"
                target="_blank"
              >
                Google&apos;s own privacy policy
              </a>
              . Our payment processor, NOWPayments, may also set its own cookies on its own hosted
              checkout page during a deposit — that page is operated by NOWPayments, not Dialect
              Library, and is covered by NOWPayments&apos; own privacy and cookie practices.
            </p>
          </section>

          <section className="grid gap-2">
            <h2 className="text-xl font-black text-[#050505]">5. Managing cookies</h2>
            <p>
              Most browsers let you block or delete cookies through their settings. Since our
              session cookie is required to stay logged in, blocking it will sign you out and
              prevent you from accessing your trainer dashboard or wallet.
            </p>
          </section>

          <section className="grid gap-2">
            <h2 className="text-xl font-black text-[#050505]">6. Changes to this policy</h2>
            <p>
              If Dialect Library adds any further non-essential cookies in the future, we will
              update this page to reflect that before doing so.
            </p>
          </section>

          <section className="grid gap-2">
            <h2 className="text-xl font-black text-[#050505]">7. Contact</h2>
            <p>Questions about this Cookie Policy can be sent to hello@dialectlibrary.com.</p>
          </section>
        </article>
      </div>
      <div className="relative z-10">
        <LandingFooter />
      </div>
    </main>
  );
}

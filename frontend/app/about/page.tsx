import Link from 'next/link';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { LandingFooter } from '@/components/landing/LandingFooter';
import { LandingHeader } from '@/components/landing/LandingHeader';
import { ParallaxTopBackground } from '@/components/ParallaxTopBackground';

export const metadata = {
  title: 'About Us',
  description:
    'Learn how Dialect Library collects local voice recordings and word translations for underrepresented dialects.',
};

const principles = [
  {
    title: 'Dialect-first data',
    body: 'Dialect Library is built around local speech, not generic language labels. Trainers contribute the words, accents, and phrasing that speech systems usually miss.',
  },
  {
    title: 'Human review',
    body: 'Submissions are designed to be cross-checked by other trainers in the same dialect cluster before they count toward reward calculations.',
  },
  {
    title: 'Ongoing transparency',
    body: 'The platform is under active development. Totals, reward flows, and scoring views will keep evolving as more submissions and settlement data come in.',
  },
];

const pilotTracks = ['English', 'Igbo', 'Yoruba', 'Hausa'];

const howItWorks = [
  {
    step: '01',
    title: 'Fund your account',
    body: 'Trainers top up their wallet with tokens, which pay for the AI-assisted tools used to generate, transcribe, and analyze prompts during training.',
  },
  {
    step: '02',
    title: 'Translate and record',
    body: 'You receive English words or prompts, translate them into your dialect, and record voice samples in languages like Igbo, Hausa, Yoruba, Tiv, and others.',
  },
  {
    step: '03',
    title: 'Get scored and paid',
    body: 'Submissions are quality-scored and paid out from the pool funded by data subscribers, covering your token spend and putting you in profit.',
  },
  {
    step: '04',
    title: 'Refer, resell, or cash out',
    body: 'Earn admin-configured referral bonuses from confirmed token funding and eligible scored training payouts from people you invite.',
  },
];

export default function AboutPage() {
  return (
    <main className="relative isolate min-h-screen overflow-hidden bg-white text-[#050505]">
      <ParallaxTopBackground />
      <div className="relative z-10">
        <LandingHeader />
      </div>

      <div className="relative z-10 mx-auto grid max-w-7xl gap-8 px-4 py-6 md:px-8">
        <Breadcrumbs items={[{ label: 'About Us' }]} />

        <section className="grid gap-5 rounded-lg border border-line bg-white/80 p-5 shadow-[0_14px_32px_rgba(27,31,27,0.08)] backdrop-blur-sm md:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)] md:p-7">
          <div className="grid gap-4">
            <p className="text-sm font-extrabold uppercase text-accent">About Dialect Library</p>
            <h1 className="max-w-3xl text-4xl font-black leading-tight md:text-5xl">
              Building voice AI with the people who know each dialect best.
            </h1>
            <p className="max-w-2xl text-lg leading-relaxed text-[rgba(5,5,5,0.68)]">
              Dialect Library is a crowdsourced voice and dialect data platform. Trainers record prompts, translate word
              tasks, and help create speech datasets that reflect how people actually speak in their communities.
            </p>
            <div>
              <Link
                className="inline-flex min-h-11 items-center justify-center rounded-full border border-accent bg-accent px-5 py-3 font-extrabold text-white no-underline transition-colors hover:border-accent-dark hover:bg-accent-dark"
                href="/register"
              >
                Become a trainer
              </Link>
            </div>
          </div>

          <aside className="grid content-start gap-3 rounded-lg border border-[rgba(5,5,5,0.1)] bg-surface p-4">
            <h2 className="text-xl font-black">Current dialect tracks</h2>
            <div className="grid grid-cols-2 gap-2">
              {pilotTracks.map((track) => (
                <span className="rounded-lg border border-line bg-surface-muted px-3 py-2 text-sm font-bold" key={track}>
                  {track}
                </span>
              ))}
            </div>
            <p className="leading-relaxed text-muted">
              Coverage expands through registered model and prompt support, not by silently substituting a different
              language model.
            </p>
          </aside>
        </section>

        <section className="grid gap-4" aria-label="How Dialect Library works">
          <div className="grid gap-2">
            <h2 className="text-3xl font-black leading-tight md:text-4xl">How it works</h2>
            <p className="max-w-2xl leading-relaxed text-muted">
              From funding your account to getting paid, referring others, or cashing out — here is the full loop.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {howItWorks.map((item) => (
              <article className="grid gap-2 rounded-lg border border-line bg-surface p-5" key={item.step}>
                <p className="text-sm font-extrabold uppercase text-accent">{item.step}</p>
                <h3 className="text-xl font-black">{item.title}</h3>
                <p className="leading-relaxed text-muted">{item.body}</p>
              </article>
            ))}
          </div>
          <p className="leading-relaxed text-muted">
            Payout scoring, the subscriber-funded reward pool, and member-to-member token resale are actively being built
            out. Token funding is live today, and referral bonuses are controlled from the admin dashboard.
          </p>
        </section>

        <section className="grid gap-4 md:grid-cols-3" aria-label="Dialect Library principles">
          {principles.map((principle) => (
            <article className="grid gap-3 rounded-lg border border-line bg-surface p-5" key={principle.title}>
              <h2 className="text-xl font-black">{principle.title}</h2>
              <p className="leading-relaxed text-muted">{principle.body}</p>
            </article>
          ))}
        </section>

        <section className="grid gap-3 rounded-lg border border-[#efd6ad] bg-[#fff7e8] p-5 text-[#8a4b0f]">
          <h2 className="text-2xl font-black">Why this matters</h2>
          <p className="max-w-4xl leading-relaxed">
            Speech tools often work best for well-represented accents and languages. Dialect Library focuses on collecting
            high-signal local examples so future ASR and voice systems can serve more speakers accurately.
          </p>
        </section>
      </div>

      <div className="relative z-10">
        <LandingFooter />
      </div>
    </main>
  );
}

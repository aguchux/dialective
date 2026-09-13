import Image from 'next/image';
import Link from 'next/link';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { LandingFooter } from '@/components/landing/LandingFooter';
import { LandingHeader } from '@/components/landing/LandingHeader';
import { ParallaxTopBackground } from '@/components/ParallaxTopBackground';

export const metadata = {
  title: 'Voice Stream',
  description:
    'License searchable, independently validated dialect voice data through Dialect Library Voice Stream -- built for ASR, voice assistant, and speech research teams.',
};

const features = [
  {
    title: 'Searchable voice catalogue',
    body: 'Filter recordings by country, dialect, sub-dialect, and quality score to find exactly the coverage your model needs.',
  },
  {
    title: 'Independent validation (ISVP)',
    body: 'Subscriber organizations can run their own quality validations on recordings, aggregated across orgs into a versioned Independent Subscriber Validation Consensus (ISVC) score.',
  },
  {
    title: 'Curated Stream Decks',
    body: 'Save eligible recordings into named collections your team can revisit, share internally, and re-download as the catalogue grows.',
  },
  {
    title: 'Team access, one subscription',
    body: 'Invite teammates with owner, admin, dataset-manager, or validator roles under a single organization subscription.',
  },
];

const useCases = [
  {
    title: 'Speech recognition',
    body: 'Train or fine-tune ASR models on real accents and dialects instead of a single standardized reference.',
  },
  {
    title: 'Voice assistants',
    body: 'Improve wake-word and command recognition for users your product currently underserves.',
  },
  {
    title: 'Linguistic research',
    body: 'Access word-level translations paired with native pronunciation for underrepresented dialects.',
  },
];

export default function StreamPage() {
  return (
    <main className="relative isolate min-h-screen overflow-hidden bg-white text-[#050505]">
      <ParallaxTopBackground />
      <LandingHeader />

      <div className="relative z-10 mx-auto grid max-w-7xl gap-8 px-4 py-6 md:px-8">
        <Breadcrumbs items={[{ label: 'Stream' }]} />

        <section className="grid gap-5 rounded-lg border border-line bg-white/80 p-5 shadow-[0_14px_32px_rgba(27,31,27,0.08)] backdrop-blur-sm md:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)] md:p-7">
          <div className="grid gap-4">
            <p className="text-sm font-extrabold uppercase text-accent">Dialect Library Voice Stream</p>
            <h1 className="max-w-3xl text-4xl font-black leading-tight md:text-5xl">
              Real dialect voice data, searchable and independently validated.
            </h1>
            <p className="max-w-2xl text-lg leading-relaxed text-[rgba(5,5,5,0.68)]">
              Voice Stream gives AI and ASR teams a subscription-based way to search, validate, and
              license the voice recordings collected by Dialect Library&apos;s trainer community --
              across countries, dialects, and sub-dialects most datasets miss.
            </p>
            <Link
              className="inline-flex min-h-11 w-fit items-center justify-center rounded-full border border-accent bg-accent px-5 py-3 font-extrabold text-white no-underline transition-colors hover:border-accent-dark hover:bg-accent-dark"
              href="/data-access"
            >
              Get notified
            </Link>
          </div>

          <div className="relative min-h-[260px] overflow-hidden rounded-lg border border-[rgba(5,5,5,0.1)] bg-[#f4f1fa] md:min-h-0">
            <Image
              alt="Voice Stream catalogue shown on an AI team's workspace display"
              className="object-cover"
              fill
              priority
              sizes="(max-width: 767px) calc(100vw - 72px), (max-width: 1280px) 40vw, 500px"
              src="/voice-stream-product.jpg"
            />
          </div>
        </section>

        <section className="grid gap-4" aria-label="Voice Stream features">
          <div className="grid gap-2">
            <h2 className="text-3xl font-black leading-tight md:text-4xl">
              Built for teams who need to trust the data
            </h2>
            <p className="max-w-2xl leading-relaxed text-muted">
              Every recording in the catalogue can carry independent validation evidence from
              multiple subscriber organizations, not just Dialect Library&apos;s own scoring.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {features.map((feature) => (
              <article
                className="grid gap-2 rounded-lg border border-line bg-surface p-5"
                key={feature.title}
              >
                <h3 className="text-xl font-black">{feature.title}</h3>
                <p className="leading-relaxed text-muted">{feature.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3" aria-label="Voice Stream use cases">
          {useCases.map((useCase) => (
            <article
              className="grid gap-3 rounded-lg border border-line bg-surface p-5"
              key={useCase.title}
            >
              <h2 className="text-xl font-black">{useCase.title}</h2>
              <p className="leading-relaxed text-muted">{useCase.body}</p>
            </article>
          ))}
        </section>

        <section className="grid gap-3 rounded-lg border border-[#efd6ad] bg-[#fff7e8] p-5 text-[#8a4b0f]">
          <h2 className="text-2xl font-black">Voice Stream is coming soon</h2>
          <p className="max-w-4xl leading-relaxed">
            Subscriptions aren&apos;t open yet. If you&apos;d like to be notified when Voice Stream
            launches, reach out and we&apos;ll follow up about coverage, access, and licensing terms.
          </p>
          <div>
            <Link
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#8a4b0f] bg-[#8a4b0f] px-5 py-3 font-extrabold text-white no-underline transition-colors hover:opacity-90"
              href="/data-access"
            >
              Get notified
            </Link>
          </div>
        </section>
      </div>

      <div className="relative z-10">
        <LandingFooter />
      </div>
    </main>
  );
}

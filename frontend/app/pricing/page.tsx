'use client';

import Link from 'next/link';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { LandingFooter } from '@/components/landing/LandingFooter';
import { LandingHeader } from '@/components/landing/LandingHeader';
import { ParallaxTopBackground } from '@/components/ParallaxTopBackground';
import { useGetPublicSubscriptionPlansQuery } from '@/store/api';

function formatLimit(value: number | null, unit: string) {
  return value === null ? `Unlimited ${unit}` : `Up to ${value} ${unit}`;
}

export default function PricingPage() {
  const { data: plans, isLoading, isError } = useGetPublicSubscriptionPlansQuery();

  return (
    <main className="relative isolate min-h-screen overflow-hidden bg-white text-[#050505]">
      <ParallaxTopBackground />
      <LandingHeader />

      <div className="relative z-10 mx-auto grid max-w-7xl gap-8 px-4 py-6 md:px-8">
        <Breadcrumbs items={[{ label: 'Pricing' }]} />

        <section className="grid gap-4">
          <p className="text-sm font-extrabold uppercase text-accent">Voice Stream pricing</p>
          <h1 className="max-w-3xl text-4xl font-black leading-tight md:text-5xl">
            One subscription, your whole team.
          </h1>
          <p className="max-w-2xl text-lg leading-relaxed text-[rgba(5,5,5,0.68)]">
            Every plan includes catalogue search, ISVC quality filtering, and Stream Decks. Tiers
            differ in how many decks and teammates you can add.
          </p>
        </section>

        {isLoading && <p className="text-muted">Loading plans...</p>}
        {isError && (
          <p className="text-danger" role="alert">
            Unable to load pricing right now. Please try again shortly.
          </p>
        )}
        {!isLoading && !isError && plans?.length === 0 && (
          <p className="text-muted">Pricing is being finalized -- check back soon.</p>
        )}

        {!isLoading && plans && plans.length > 0 && (
          <section className="grid gap-4 md:grid-cols-3" aria-label="Subscription plans">
            {plans.map((plan) => (
              <article
                className="grid gap-4 rounded-lg border border-line bg-surface p-6"
                key={plan.key}
              >
                <div className="grid gap-1">
                  <h2 className="text-2xl font-black">{plan.name}</h2>
                  <p className="text-3xl font-black text-accent">
                    ${plan.monthlyUsdAmount}
                    <span className="text-base font-bold text-muted">/mo</span>
                  </p>
                </div>
                <ul className="grid gap-2 leading-relaxed text-muted">
                  <li>Catalogue search &amp; preview</li>
                  <li>ISVC quality filtering</li>
                  <li>{formatLimit(plan.maxStreamDecks, 'Stream Decks')}</li>
                  <li>{formatLimit(plan.maxTeamMembers, 'team members')}</li>
                  <li>
                    {plan.minIsvcConfidence
                      ? `Access to ${plan.minIsvcConfidence === 'VERY_HIGH' ? 'Premium Verified' : plan.minIsvcConfidence.replace('_', ' ').toLowerCase()}-confidence data and above`
                      : 'Access to the full catalogue, all quality tiers'}
                  </li>
                </ul>
                <span
                  aria-disabled="true"
                  className="inline-flex min-h-11 cursor-not-allowed items-center justify-center rounded-full border border-line bg-[rgba(5,5,5,0.06)] px-5 py-3 font-extrabold text-[rgba(5,5,5,0.45)]"
                >
                  Coming soon
                </span>
              </article>
            ))}
          </section>
        )}

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

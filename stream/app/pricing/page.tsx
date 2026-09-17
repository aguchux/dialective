import Link from 'next/link';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { StreamMarketingHeader } from '@/components/StreamMarketingHeader';

const planOptions = [
  {
    name: 'Starter',
    description: 'For focused exploration and early data evaluation.',
    items: ['Voice catalogue access', 'Scoped Stream Decks', 'Core quality signals'],
  },
  {
    name: 'Team',
    description: 'For product and research teams operating shared data workflows.',
    items: [
      'Team roles and access controls',
      'Independent validation workflows',
      'API access and usage visibility',
    ],
    featured: true,
  },
  {
    name: 'Enterprise',
    description: 'For organizations with advanced delivery, governance, and support needs.',
    items: [
      'Custom access and coverage',
      'Advanced security controls',
      'Dedicated commercial support',
    ],
  },
];

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-[#f6f8fc] text-[#101a34]">
      <StreamMarketingHeader />
      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-extrabold uppercase text-accent">Voice Stream pricing</p>
          <h1 className="mt-2 text-4xl font-black leading-tight sm:text-5xl">
            Plans built around how your team uses voice data.
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-muted">
            Choose the access level that fits your catalogue, validation, and delivery requirements.
            Your organization can review the available plan options before activation.
          </p>
        </div>
        <div className="mt-10 grid gap-4 lg:grid-cols-3">
          {planOptions.map((plan) => (
            <article
              className={`grid gap-5 rounded-xl border p-6 ${plan.featured ? 'border-accent bg-white shadow-[0_14px_32px_rgba(47,111,237,0.15)]' : 'border-line bg-white'}`}
              key={plan.name}
            >
              {plan.featured && (
                <span className="w-fit rounded-full bg-accent-soft px-3 py-1 text-xs font-extrabold text-accent-dark">
                  For growing teams
                </span>
              )}
              <div>
                <h2 className="text-2xl font-black">{plan.name}</h2>
                <p className="mt-2 leading-relaxed text-muted">{plan.description}</p>
              </div>
              <ul className="grid gap-3 text-sm">
                {plan.items.map((item) => (
                  <li className="flex gap-2" key={item}>
                    <CheckCircle2
                      aria-hidden="true"
                      className="mt-0.5 size-4 shrink-0 text-success"
                    />
                    {item}
                  </li>
                ))}
              </ul>
              <Link
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-accent px-4 py-3 font-extrabold text-white no-underline hover:bg-accent-dark"
                href="/register"
              >
                Get started <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
            </article>
          ))}
        </div>
        <p className="mx-auto mt-8 max-w-2xl text-center text-sm leading-relaxed text-muted">
          Subscription availability, pricing, and limits are configured for your organization&apos;s
          selected plan. Sign up to review and activate the current options.
        </p>
      </section>
    </main>
  );
}

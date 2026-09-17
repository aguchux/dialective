import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, BookOpen, KeyRound, Webhook } from 'lucide-react';
import { StreamMarketingHeader } from '@/components/StreamMarketingHeader';

export const metadata: Metadata = {
  title: 'API Documentation | Dialect Library Stream',
  description:
    'Reference documentation for the Dialect Library Stream API: authentication, catalogue endpoints, and delivery webhooks.',
};

// Placeholder. The sidebar's "API Docs" entry is public (see StreamSidebar's
// NAV_ITEMS) so the reference is reachable before signup, which means this
// route has to exist rather than 404 while the full reference is written.
// Each card below names a surface that already ships in the API today, so
// this stays honest about what exists rather than advertising endpoints that
// don't.
const sections = [
  {
    icon: KeyRound,
    title: 'Authentication',
    description:
      'API keys and OAuth clients are issued per organization. Create and revoke them from your dashboard once you have an account.',
    href: '/dashboard/api-keys',
    linkLabel: 'Manage API keys',
  },
  {
    icon: BookOpen,
    title: 'Catalogue access',
    description:
      'Browse collections, dialects, speakers, and quality signals programmatically, using the same filters available in the voice library.',
    href: '/discover',
    linkLabel: 'Browse the catalogue',
  },
  {
    icon: Webhook,
    title: 'Webhooks',
    description:
      'Subscribe to delivery and validation events so your systems react as datasets are updated rather than polling for changes.',
    href: '/dashboard/webhooks',
    linkLabel: 'Configure webhooks',
  },
];

export default function DocsPage() {
  return (
    <main className="min-h-screen bg-[#f6f8fc] text-[#101a34]">
      <StreamMarketingHeader />
      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-extrabold uppercase text-accent">Developers</p>
          <h1 className="mt-2 text-4xl font-black leading-tight sm:text-5xl">API documentation</h1>
          <p className="mt-4 text-lg leading-relaxed text-muted">
            The full endpoint reference is being written. In the meantime, here is what the API
            covers today and where to set it up.
          </p>
        </div>

        <div className="mt-10 grid gap-4 lg:grid-cols-3">
          {sections.map((section) => {
            const Icon = section.icon;
            return (
              <article className="grid gap-4 rounded-xl border border-line bg-white p-6" key={section.title}>
                <span className="flex size-10 items-center justify-center rounded-lg bg-accent-soft text-accent-dark">
                  <Icon aria-hidden="true" className="size-5" />
                </span>
                <div>
                  <h2 className="text-xl font-black">{section.title}</h2>
                  <p className="mt-2 leading-relaxed text-muted">{section.description}</p>
                </div>
                <Link
                  className="inline-flex w-fit items-center gap-1.5 font-extrabold text-accent no-underline hover:text-accent-dark"
                  href={section.href}
                >
                  {section.linkLabel}
                  <ArrowRight aria-hidden="true" className="size-4" />
                </Link>
              </article>
            );
          })}
        </div>

        <div className="mx-auto mt-10 grid max-w-2xl gap-4 rounded-xl border border-line bg-white p-6 text-center">
          <h2 className="text-2xl font-black">Need the reference now?</h2>
          <p className="leading-relaxed text-muted">
            If you are building against the API before the published reference lands, get in touch
            and we will walk your team through the available endpoints.
          </p>
          <Link
            className="mx-auto inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-accent px-4 py-3 font-extrabold text-white no-underline hover:bg-accent-dark"
            href="/register"
          >
            Create an account
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </div>
      </section>
    </main>
  );
}

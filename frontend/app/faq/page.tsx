import { FaqAccordion } from '@/components/faq/FaqAccordion';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { LandingFooter } from '@/components/landing/LandingFooter';
import { LandingHeader } from '@/components/landing/LandingHeader';
import { ParallaxTopBackground } from '@/components/ParallaxTopBackground';

export const metadata = {
  title: 'FAQ',
  description: 'Answers about contributing dialect recordings, word translations, review, privacy, and rewards.',
};

export default function FaqPage() {
  return (
    <main className="relative isolate min-h-screen overflow-hidden bg-white text-[#050505]">
      <ParallaxTopBackground />
      <LandingHeader />
      <div className="relative z-10 mx-auto grid max-w-3xl gap-6 px-4 py-6 md:px-8">
        <Breadcrumbs items={[{ label: 'FAQs' }]} />
        <section className="grid gap-3 rounded-lg border border-line bg-surface p-5">
          <p className="text-sm font-extrabold uppercase text-accent">Support</p>
          <h1 className="text-4xl font-black leading-tight">Frequently Asked Questions</h1>
          <p className="max-w-2xl leading-relaxed text-muted">
            Clear answers about trainer accounts, dialect tasks, review, and payouts.
          </p>
        </section>

        <FaqAccordion />
      </div>
      <div className="relative z-10">
        <LandingFooter />
      </div>
    </main>
  );
}

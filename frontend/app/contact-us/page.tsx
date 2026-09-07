import { Breadcrumbs } from '@/components/Breadcrumbs';
import { LandingFooter } from '@/components/landing/LandingFooter';
import { LandingHeader } from '@/components/landing/LandingHeader';
import { ParallaxTopBackground } from '@/components/ParallaxTopBackground';

export const metadata = {
  title: 'Contact Us',
  description: 'Get in touch with Dialect Library, or find our office addresses.',
};

type Office = {
  country: string;
  lines: string[];
};

const OFFICES: Office[] = [
  {
    country: 'United Kingdom',
    lines: ['32 Cradock Road', 'Canterbury, Kent', 'CT1 1YP', 'United Kingdom'],
  },
  {
    country: 'Nigeria',
    lines: [
      '3 Agu Street',
      'Upper Housing Estate Extension',
      'Abakpa Nike',
      'Enugu, Nigeria',
    ],
  },
];

export default function ContactUsPage() {
  return (
    <main className="relative isolate min-h-screen overflow-hidden bg-white text-[#050505]">
      <ParallaxTopBackground />
      <LandingHeader />
      <div className="relative z-10 mx-auto grid max-w-3xl gap-6 px-4 py-6 md:px-8">
        <Breadcrumbs items={[{ label: 'Contact Us' }]} />
        <section className="grid gap-3 rounded-lg border border-line bg-surface p-5">
          <p className="text-sm font-extrabold uppercase text-accent">Get in touch</p>
          <h1 className="text-4xl font-black leading-tight">Contact Us</h1>
          <p className="max-w-2xl leading-relaxed text-muted">
            Questions about your account, a data license, or anything else? Reach us at{' '}
            <a className="font-bold text-accent hover:underline" href="mailto:hello@dialectlibrary.com">
              hello@dialectlibrary.com
            </a>
            , or find our office addresses below.
          </p>
          <h2 className="text-lg font-black text-[#050505]">
            Dialect Library is a subsidiary of De-Golojan Technologies Ltd (RC 1606658).
          </h2>
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          {OFFICES.map((office) => (
            <div
              className="grid gap-2 rounded-lg border border-line bg-surface p-5"
              key={office.country}
            >
              <h2 className="text-xl font-black text-[#050505]">{office.country}</h2>
              <address className="not-italic leading-relaxed text-[rgba(5,5,5,0.78)]">
                {office.lines.map((line) => (
                  <span className="block" key={line}>
                    {line}
                  </span>
                ))}
              </address>
            </div>
          ))}
        </section>
      </div>
      <div className="relative z-10">
        <LandingFooter />
      </div>
    </main>
  );
}

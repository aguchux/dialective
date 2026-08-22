'use client';

import { useState } from 'react';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { LandingFooter } from '@/components/landing/LandingFooter';
import { LandingHeader } from '@/components/landing/LandingHeader';
import { ParallaxTopBackground } from '@/components/ParallaxTopBackground';
import { normalizeErrorMessage, useCreateDataAccessLeadMutation } from '@/store/api';
import { ActionButton } from '@/components/ui/ActionButton';

const inputClass =
  'min-h-10 w-full rounded-lg border border-line bg-white px-3 py-2.5 text-ink dark:bg-surface-muted';
const primaryButtonClass =
  'inline-flex min-h-11 items-center justify-center rounded-full border border-accent bg-accent px-5 py-3 font-extrabold text-white transition-colors hover:border-accent-dark hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60';

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

export default function DataAccessPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [organization, setOrganization] = useState('');
  const [website, setWebsite] = useState('');
  const [countriesInterested, setCountriesInterested] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [createLead, { isLoading }] = useCreateDataAccessLeadMutation();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await createLead({
        name,
        email,
        organization,
        website,
        countriesInterested,
      }).unwrap();
      setSubmitted(true);
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to submit your request. Please try again.'));
    }
  }

  return (
    <main className="relative isolate min-h-screen overflow-hidden bg-white text-[#050505]">
      <ParallaxTopBackground />
      <LandingHeader />

      <div className="relative z-10 mx-auto grid max-w-7xl gap-8 px-4 py-6 md:px-8">
        <Breadcrumbs items={[{ label: 'Subscribe to voice data' }]} />

        <section className="grid gap-5 rounded-lg border border-line bg-white/80 p-5 shadow-[0_14px_32px_rgba(27,31,27,0.08)] backdrop-blur-sm md:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)] md:p-7">
          <div className="grid gap-4">
            <p className="text-sm font-extrabold uppercase text-accent">
              For teams and researchers
            </p>
            <h1 className="max-w-3xl text-4xl font-black leading-tight md:text-5xl">
              License voice and dialect data collected by real speakers.
            </h1>
            <p className="max-w-2xl text-lg leading-relaxed text-[rgba(5,5,5,0.68)]">
              Dialect Library&apos;s dataset is growing every day. Tell us your organization,
              website, and target countries and we&apos;ll follow up about access, coverage, and
              licensing terms.
            </p>
          </div>

          <aside className="grid content-start gap-4 rounded-lg border border-[rgba(5,5,5,0.1)] bg-surface p-4">
            {submitted ? (
              <>
                <h2 className="text-xl font-black">Thanks — request received</h2>
                <p className="leading-relaxed text-muted">
                  We&apos;ll reach out at the email you provided to discuss access and pricing.
                </p>
              </>
            ) : (
              <>
                <h2 className="text-xl font-black">Request access</h2>
                <form className="grid gap-2.5" onSubmit={handleSubmit}>
                  <input
                    className={inputClass}
                    type="text"
                    placeholder="Your name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                  <input
                    className={inputClass}
                    type="email"
                    placeholder="Work email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                  <input
                    className={inputClass}
                    type="text"
                    placeholder="Company / organization"
                    value={organization}
                    onChange={(e) => setOrganization(e.target.value)}
                    required
                  />
                  <input
                    className={inputClass}
                    type="url"
                    placeholder="Website"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    required
                  />
                  <input
                    className={inputClass}
                    type="text"
                    placeholder="Countries interested in (e.g. Nigeria, Ghana, Kenya)"
                    value={countriesInterested}
                    onChange={(e) => setCountriesInterested(e.target.value)}
                    required
                  />
                  <ActionButton
                    className={primaryButtonClass}
                    type="submit"
                    pending={isLoading}
                    pendingLabel="Submitting request"
                  >
                    Subscribe to voice data
                  </ActionButton>
                </form>
                {error && (
                  <p className="leading-relaxed text-danger" role="alert">
                    {error}
                  </p>
                )}
              </>
            )}
          </aside>
        </section>

        <section className="grid gap-4 md:grid-cols-3" aria-label="Data access use cases">
          {useCases.map((item) => (
            <article
              className="grid gap-3 rounded-lg border border-line bg-surface p-5"
              key={item.title}
            >
              <h2 className="text-xl font-black">{item.title}</h2>
              <p className="leading-relaxed text-muted">{item.body}</p>
            </article>
          ))}
        </section>

        <section className="grid gap-3 rounded-lg border border-[#efd6ad] bg-[#fff7e8] p-5 text-[#8a4b0f]">
          <h2 className="text-2xl font-black">Manual review</h2>
          <p className="max-w-4xl leading-relaxed">
            There is no self-serve subscription yet — every request is reviewed manually while the
            dataset and licensing terms are still being defined.
          </p>
        </section>
      </div>

      <div className="relative z-10">
        <LandingFooter />
      </div>
    </main>
  );
}

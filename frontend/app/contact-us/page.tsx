'use client';

import { useState } from 'react';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { LandingFooter } from '@/components/landing/LandingFooter';
import { LandingHeader } from '@/components/landing/LandingHeader';
import { ParallaxTopBackground } from '@/components/ParallaxTopBackground';
import { ActionButton } from '@/components/ui/ActionButton';
import { normalizeErrorMessage, useCreateSupportRequestMutation } from '@/store/api';

const inputClass =
  'min-h-10 w-full rounded-lg border border-line bg-white px-3 py-2.5 text-ink dark:bg-surface-muted';
const primaryButtonClass =
  'inline-flex min-h-11 items-center justify-center rounded-full border border-accent bg-accent px-5 py-3 font-extrabold text-white transition-colors hover:border-accent-dark hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60';

export default function ContactUsPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [createSupportRequest, { isLoading }] = useCreateSupportRequestMutation();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await createSupportRequest({ name, email, subject, message }).unwrap();
      setSubmitted(true);
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to send your message. Please try again.'));
    }
  }

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
            Questions about your account, a data license, or anything else? Send us a message below
            and we&apos;ll get back to you at the email you provide.
          </p>
          <h2 className="text-lg font-black text-[#050505]">
            Dialect Library is a subsidiary of De-Golojan Technologies Ltd (RC 1606658).
          </h2>
        </section>

        <section className="grid gap-4 rounded-lg border border-line bg-surface p-5 md:p-7">
          {submitted ? (
            <>
              <h2 className="text-xl font-black">Thanks — message received</h2>
              <p className="leading-relaxed text-muted">
                We&apos;ll reach out at the email you provided as soon as we can.
              </p>
            </>
          ) : (
            <>
              <h2 className="text-xl font-black">Send us a message</h2>
              <form className="grid gap-2.5" onSubmit={handleSubmit}>
                <input
                  className={inputClass}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  required
                  type="text"
                  value={name}
                />
                <input
                  className={inputClass}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Your email"
                  required
                  type="email"
                  value={email}
                />
                <input
                  className={inputClass}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Subject"
                  required
                  type="text"
                  value={subject}
                />
                <textarea
                  className={`${inputClass} min-h-32 resize-y py-2.5`}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="How can we help?"
                  required
                  value={message}
                />
                <ActionButton
                  className={primaryButtonClass}
                  pending={isLoading}
                  pendingLabel="Sending"
                  type="submit"
                >
                  Send message
                </ActionButton>
              </form>
              {error && (
                <p className="leading-relaxed text-danger" role="alert">
                  {error}
                </p>
              )}
            </>
          )}
        </section>
      </div>
      <div className="relative z-10">
        <LandingFooter />
      </div>
    </main>
  );
}

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import { BrandLogo } from '@/components/BrandLogo';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { ParallaxTopBackground } from '@/components/ParallaxTopBackground';
import { useGetDialectsQuery, useGetWalletQuery } from '@/store/api';

function ReferralLinkCard({ referralCode }: { referralCode: string }) {
  const [copied, setCopied] = useState(false);
  const referralLink = typeof window !== 'undefined' ? `${window.location.origin}/register?ref=${referralCode}` : '';

  async function handleCopy() {
    await navigator.clipboard.writeText(referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <section className="grid gap-2 rounded-lg border border-line bg-surface p-4">
      <h2 className="text-lg font-black">Your referral link</h2>
      <p className="leading-relaxed text-muted">
        Earn referral bonuses from confirmed token funding and eligible scored training payouts when those bonuses are enabled.
      </p>
      <div className="flex items-center gap-2 rounded-lg border border-line bg-surface-muted px-3 py-2">
        <span className="min-w-0 flex-1 truncate text-sm font-bold">{referralLink}</span>
        <button
          className="shrink-0 rounded-lg border border-accent bg-accent px-3 py-1.5 text-sm font-bold text-white transition-colors hover:bg-accent-dark"
          onClick={handleCopy}
          type="button"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </section>
  );
}

const taskCards = [
  {
    title: 'Record sentence prompts',
    body: 'Read short prompts aloud so the ASR pipeline can learn your dialect voice.',
    href: '/pipeline-test',
    cta: 'Start recording',
  },
  {
    title: 'Translate word library',
    body: 'Add local translations and voice examples for common English words.',
    href: '/pipeline-test',
    cta: 'Open word tasks',
  },
];

export default function TrainerDashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { data: wallet } = useGetWalletQuery(undefined, { skip: status !== 'authenticated' });
  const { data: countryDialects } = useGetDialectsQuery(session?.user?.countryId ?? '', {
    skip: !session?.user?.countryId,
  });

  const stats = [
    { label: 'Wallet balance', value: wallet ? `${Number(wallet.balance).toLocaleString(undefined, { maximumFractionDigits: 2 })} tokens` : '...' },
    { label: 'Submitted', value: 'Not tracked yet' },
    { label: 'Pending review', value: 'Not tracked yet' },
    { label: 'Accepted', value: 'Not tracked yet' },
  ];

  useEffect(() => {
    if (status !== 'authenticated') {
      return;
    }
    if (session.user?.role === 'ADMIN') {
      router.replace('/admin');
    } else if (session.user?.onboardingComplete === false) {
      router.replace('/onboarding');
    }
  }, [status, session, router]);

  if (
    status === 'loading' ||
    (status === 'authenticated' && (session.user?.role === 'ADMIN' || session.user?.onboardingComplete === false))
  ) {
    return (
      <main className="relative isolate min-h-screen overflow-hidden bg-bg px-4 py-6 text-ink">
        <ParallaxTopBackground />
        <div className="relative z-10 mx-auto max-w-6xl">
          <Breadcrumbs items={[{ label: 'Dashboard' }]} />
          <p className="text-muted">Loading dashboard...</p>
        </div>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="relative isolate grid min-h-screen place-content-center overflow-hidden bg-bg px-4 py-6 text-ink">
        <ParallaxTopBackground />
        <section className="relative z-10 grid max-w-sm gap-4 rounded-lg border border-line bg-surface p-5 shadow-[0_12px_28px_rgba(27,31,27,0.07)]">
          <Breadcrumbs items={[{ label: 'Dashboard' }]} />
          <BrandLogo href="" size={34} className="text-accent" textClassName="text-sm uppercase" />
          <h1 className="text-2xl font-black">Trainer dashboard</h1>
          <p className="leading-relaxed text-muted">Log in to access your account and start training AI with dialect data.</p>
          <div className="grid gap-2">
            <Link
              className="inline-flex min-h-10 items-center justify-center rounded-lg border border-accent bg-accent px-4 py-2.5 font-bold text-white no-underline hover:bg-accent-dark"
              href="/login"
            >
              Log in
            </Link>
            <Link
              className="inline-flex min-h-10 items-center justify-center rounded-lg border border-line bg-surface px-4 py-2.5 font-bold text-ink no-underline hover:bg-surface-muted"
              href="/register"
            >
              Create account
            </Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="relative isolate min-h-screen overflow-hidden bg-bg px-4 py-5 text-ink md:px-8">
      <ParallaxTopBackground />
      <div className="relative z-10 mx-auto grid max-w-6xl gap-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <BrandLogo className="text-xl text-ink" size={40} />
          <div className="flex items-center gap-2">
            <Link
              className="inline-flex min-h-10 items-center justify-center rounded-lg border border-line bg-surface px-3 py-2 font-bold text-ink no-underline hover:bg-surface-muted"
              href="/"
            >
              Home
            </Link>
            <button
              className="inline-flex min-h-10 items-center justify-center rounded-lg border border-line bg-surface px-3 py-2 font-bold text-ink hover:bg-surface-muted"
              onClick={() => signOut({ callbackUrl: '/' })}
              type="button"
            >
              Sign out
            </button>
          </div>
        </header>

        <Breadcrumbs items={[{ label: 'Dashboard' }]} />

        <section className="grid gap-4 rounded-lg border border-line bg-surface p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:p-5">
          <div className="grid gap-2">
            <p className="text-sm font-extrabold uppercase text-accent">Trainer account</p>
            <h1 className="text-3xl font-black leading-tight md:text-4xl">Start training AI with dialects</h1>
            <p className="max-w-2xl leading-relaxed text-muted">
              Record voice prompts, contribute word translations, and track your progress from one place.
            </p>
          </div>
          <div className="rounded-lg border border-line bg-surface-muted p-3 md:min-w-64">
            <p className="text-sm font-bold text-muted">Signed in as</p>
            <p className="break-all font-extrabold">{session.user?.email ?? 'Trainer'}</p>
            <p className="mt-2 text-sm font-bold text-muted">Role</p>
            <p className="font-extrabold">{session.user?.role ?? 'TRAINER'}</p>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Training progress">
          {stats.map((stat) => (
            <div className="rounded-lg border border-line bg-surface p-4" key={stat.label}>
              <p className={stat.value.length > 10 ? 'text-lg font-black text-muted' : 'text-2xl font-black'}>{stat.value}</p>
              <p className="text-sm font-bold text-muted">{stat.label}</p>
            </div>
          ))}
        </section>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="grid gap-4">
            <div>
              <h2 className="text-xl font-black">Training tasks</h2>
              <p className="mt-1 text-muted">Pick a task type and contribute a few examples at a time.</p>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {taskCards.map((task) => (
                <article className="grid gap-4 rounded-lg border border-line bg-surface p-4" key={task.title}>
                  <div className="grid gap-2">
                    <h3 className="text-lg font-black">{task.title}</h3>
                    <p className="leading-relaxed text-muted">{task.body}</p>
                  </div>
                  <Link
                    className="inline-flex min-h-11 items-center justify-center rounded-lg border border-accent bg-accent px-4 py-3 font-bold text-white no-underline hover:bg-accent-dark"
                    href={task.href}
                  >
                    {task.cta}
                  </Link>
                </article>
              ))}
            </div>
          </div>

          <aside className="grid content-start gap-4">
            {session.user?.referralCode && <ReferralLinkCard referralCode={session.user.referralCode} />}

            <section className="grid gap-3 rounded-lg border border-line bg-surface p-4">
              <h2 className="text-lg font-black">Dialect tracks in your country</h2>
              {!countryDialects && session.user?.countryId && <p className="text-muted">Loading...</p>}
              {!session.user?.countryId && (
                <p className="text-muted">Finish onboarding to see dialect tracks for your country.</p>
              )}
              {countryDialects && countryDialects.length === 0 && (
                <p className="text-muted">No dialects listed for your country yet.</p>
              )}
              {countryDialects && countryDialects.length > 0 && (
                <div className="grid grid-cols-2 gap-2">
                  {countryDialects.map((dialect) => (
                    <span className="rounded-lg border border-line bg-surface-muted px-3 py-2 text-sm font-bold" key={dialect.id}>
                      {dialect.name}
                    </span>
                  ))}
                </div>
              )}
            </section>

            <section className="grid gap-2 rounded-lg border border-[#efd6ad] bg-[#fff7e8] p-4 text-[#8a4b0f]">
              <h2 className="text-lg font-black">In progress</h2>
              <p className="leading-relaxed">
                Wallet balance is live. Submission, review, and acceptance tracking are still being built, so those
                totals aren&apos;t shown yet.
              </p>
            </section>
          </aside>
        </section>
      </div>
    </main>
  );
}

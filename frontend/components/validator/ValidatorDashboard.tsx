'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { CircleDollarSign, WalletCards } from 'lucide-react';
import { PortalContainerProvider } from '@/components/ui/PortalContainer';
import { Avatar, cardClass, EmptyPanel } from '@/components/dashboard/shared';
import { BrandLogo } from '@/components/BrandLogo';
import {
  ValidatorHeader,
  ValidatorMobileNavigation,
  ValidatorView,
} from '@/components/validator/ValidatorShell';
import { StreamDecksView } from '@/components/validator/views/StreamDecksView';
import { ValidationsView } from '@/components/validator/views/ValidationsView';
import { AuditView } from '@/components/validator/views/AuditView';

const allViewIds: ValidatorView[] = ['decks', 'tokens', 'earnings', 'validations', 'audit', 'profile'];

export function ValidatorDashboard() {
  const { data: session, status } = useSession();
  const hasSeenSessionRef = useRef(false);
  if (status === 'authenticated') hasSeenSessionRef.current = true;
  const effectiveStatus = status === 'loading' && hasSeenSessionRef.current ? 'authenticated' : status;
  const router = useRouter();
  const searchParams = useSearchParams();
  const [themeRoot, setThemeRoot] = useState<HTMLDivElement | null>(null);
  const requestedView = searchParams.get('view');
  const activeView = allViewIds.includes(requestedView as ValidatorView)
    ? (requestedView as ValidatorView)
    : 'decks';
  const displayName = [session?.user.firstName, session?.user.lastName].filter(Boolean).join(' ');

  useEffect(() => {
    if (status !== 'authenticated' || !session) return;
    if (session.user.role !== 'VALIDATOR') router.replace('/dashboard');
  }, [router, session, status]);

  if (
    effectiveStatus === 'loading' ||
    (effectiveStatus === 'authenticated' && session && session.user.role !== 'VALIDATOR')
  ) {
    return <ValidatorDashboardLoading />;
  }

  if (!session) {
    return (
      <main className="dashboard-theme grid min-h-screen place-items-center bg-bg p-5 text-ink">
        <section className={`${cardClass} grid w-full max-w-sm gap-4 p-5`}>
          <BrandLogo size={36} />
          <h1 className="text-2xl font-black">Validator dashboard</h1>
          <Link
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-accent px-4 font-extrabold text-white"
            href="/login"
          >
            Log in
          </Link>
        </section>
      </main>
    );
  }

  return (
    <div className="dashboard-theme min-h-screen bg-bg text-ink" ref={setThemeRoot}>
      <PortalContainerProvider container={themeRoot}>
        <ValidatorHeader
          activeView={activeView}
          displayName={displayName || emailName(session.user.email)}
          email={session.user.email ?? 'Validator'}
          image={session.user.image}
        />

        <main className="mx-auto w-full max-w-6xl px-4 pb-28 pt-6 md:px-6 md:pt-9 lg:pb-12">
          <section className="mb-7 flex flex-wrap items-center gap-3 border-b border-line pb-6 md:gap-4">
            <Avatar email={session.user.email ?? 'Validator'} image={session.user.image} large />
            <div className="min-w-0">
              <p className="text-sm font-bold text-muted">Welcome back</p>
              <h1 className="truncate text-2xl font-black md:text-3xl">
                {displayName || emailName(session.user.email)}
              </h1>
            </div>
          </section>

          <ValidatorViewContent activeView={activeView} />
        </main>

        <ValidatorMobileNavigation activeView={activeView} />
      </PortalContainerProvider>
    </div>
  );
}

function ValidatorViewContent({ activeView }: { activeView: ValidatorView }) {
  if (activeView === 'decks') {
    return <StreamDecksView />;
  }
  if (activeView === 'tokens') {
    return <EmptyPanel icon={WalletCards} title="Your DL token balance will appear here" />;
  }
  if (activeView === 'earnings') {
    return <EmptyPanel icon={CircleDollarSign} title="Your validation earnings will appear here" />;
  }
  if (activeView === 'validations') {
    return <ValidationsView />;
  }
  if (activeView === 'audit') {
    return <AuditView />;
  }
  return null;
}

function ValidatorDashboardLoading() {
  return (
    <div className="dashboard-theme min-h-screen animate-pulse bg-bg">
      <div className="h-16 border-b border-line bg-surface" />
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        <div className="h-16 w-72 rounded-lg bg-surface-muted" />
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="h-32 rounded-lg bg-surface" />
          <div className="h-32 rounded-lg bg-surface" />
          <div className="h-32 rounded-lg bg-surface" />
        </div>
      </div>
    </div>
  );
}

function emailName(email?: string | null) {
  if (!email) return 'Validator';
  return email
    .split('@')[0]
    .replace(/[._-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

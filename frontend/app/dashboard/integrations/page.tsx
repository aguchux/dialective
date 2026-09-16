'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { PortalContainerProvider } from '@/components/ui/PortalContainer';
import {
  DashboardHeader,
  emailName,
  MobileNavigation,
} from '@/components/dashboard/DashboardShell';
import { IntegrationsMarketplace } from '@/components/integrations/IntegrationsMarketplace';

export default function IntegrationsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [themeRoot, setThemeRoot] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login');
  }, [router, status]);

  if (status === 'loading' || !session) {
    return <div className="dashboard-theme min-h-screen bg-bg" />;
  }

  const displayName =
    [session.user.firstName, session.user.lastName].filter(Boolean).join(' ') ||
    emailName(session.user.email);

  return (
    <div className="dashboard-theme min-h-screen bg-bg text-ink" ref={setThemeRoot}>
      <PortalContainerProvider container={themeRoot}>
        <DashboardHeader
          activeView="p2p"
          displayName={displayName}
          email={session.user.email ?? 'Trainer'}
          image={session.user.image}
        />

        <main className="mx-auto w-full max-w-4xl px-4 pb-28 pt-6 md:px-6 md:pt-9 lg:pb-12">
          <IntegrationsMarketplace />
        </main>

        <MobileNavigation activeView="p2p" />
      </PortalContainerProvider>
    </div>
  );
}

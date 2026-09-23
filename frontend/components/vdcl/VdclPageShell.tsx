'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { PortalContainerProvider } from '@/components/ui/PortalContainer';
import {
  DashboardHeader,
  emailName,
  MobileNavigation,
} from '@/components/dashboard/DashboardShell';
import { useGetPublicClientSettingsQuery } from '@/store/api';

/**
 * The chrome shared by every VDCL route.
 *
 * The licence flow is now two screens -- the landing page and the
 * create/edit form -- and both need the same dashboard header, theme root
 * and portal container. Duplicating that per route is how the two drift
 * into looking like different products mid-flow, so it lives here once.
 *
 * It is also where the feature gate lands, for the same reason: gating both
 * routes here means a new VDCL screen cannot be added past the gate by
 * forgetting to repeat the check. While contributor licensing is closed, a
 * bookmarked URL redirects to the dashboard rather than rendering a flow
 * whose every API call would be refused.
 */
export function VdclPageShell({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [themeRoot, setThemeRoot] = useState<HTMLDivElement | null>(null);

  const { data: publicSettings, isLoading: settingsLoading } =
    useGetPublicClientSettingsQuery();
  const vdclClosed = Boolean(publicSettings) && !publicSettings?.vdclEnabled;

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login');
  }, [router, status]);

  useEffect(() => {
    if (vdclClosed) router.replace('/dashboard');
  }, [router, vdclClosed]);

  // Hold the blank frame until the flag is known, so a contributor never sees
  // the licence page flash up before being redirected away from it.
  if (status === 'loading' || !session || settingsLoading || vdclClosed) {
    return <div className="dashboard-theme min-h-screen bg-bg" />;
  }

  const displayName =
    [session.user.firstName, session.user.lastName].filter(Boolean).join(' ') ||
    emailName(session.user.email);

  return (
    <div className="dashboard-theme min-h-screen bg-bg text-ink" ref={setThemeRoot}>
      <PortalContainerProvider container={themeRoot}>
        <DashboardHeader
          activeView={null}
          displayName={displayName}
          email={session.user.email ?? 'Trainer'}
          image={session.user.image}
        />

        <main className="mx-auto w-full max-w-4xl px-4 pb-28 pt-6 md:px-6 md:pt-9 lg:pb-12">
          {children}
        </main>

        <MobileNavigation activeView={null} />
      </PortalContainerProvider>
    </div>
  );
}

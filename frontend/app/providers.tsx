'use client';

import { useEffect } from 'react';
import { SessionProvider, signOut, useSession } from 'next-auth/react';
import { ThemeProvider } from 'next-themes';
import { StoreProvider } from '@/store/Providers';
import { onAuthMaintenance } from '@/lib/auth-maintenance-signal';
import { TawkToWidget } from '@/components/TawkToWidget';
import { AiAssistantWidget } from '@/components/AiAssistantWidget';
import { RequireNameDialog } from '@/components/RequireNameDialog';
import { PwaServiceWorker } from '@/components/PwaServiceWorker';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider refetchInterval={5 * 60} refetchOnWindowFocus>
      <InvalidSessionHandler />
      <AuthMaintenanceSessionHandler />
      <ThemeProvider
        attribute="class"
        defaultTheme="light"
        enableColorScheme={false}
        enableSystem={false}
        forcedTheme="light"
        storageKey="trainer-dashboard-theme"
      >
        <StoreProvider>
          <PwaServiceWorker />
          <TawkToWidget />
          <AiAssistantWidget />
          <RequireNameDialog />
          {children}
        </StoreProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}

function InvalidSessionHandler() {
  const { data: session, status } = useSession();

  useEffect(() => {
    if (status === 'authenticated' && session.authError === 'RefreshTokenInvalid') {
      void signOut({ callbackUrl: '/login?reason=session-expired' });
    }
  }, [session?.authError, status]);

  return null;
}

// Fires when an admin turns on authMaintenanceBlockSessions -- the next
// authenticated API call from ANY signed-in tab/page returns 503/
// AuthMaintenance (see JwtAuthGuard), dialectivaApi's base query notices it
// (store/api.ts) and calls notifyAuthMaintenance, and this listener forces
// the sign-out + redirect so the trainer lands on the same maintenance
// countdown notice a logged-out visitor sees, rather than being stuck on a
// dashboard where every request silently fails.
function AuthMaintenanceSessionHandler() {
  const { status } = useSession();

  useEffect(() => {
    return onAuthMaintenance((detail) => {
      if (status !== 'authenticated') return;
      const params = new URLSearchParams({ reason: 'maintenance' });
      if (detail.until) params.set('until', detail.until);
      if (detail.message) params.set('message', detail.message);
      void signOut({ callbackUrl: `/login?${params.toString()}` });
    });
  }, [status]);

  return null;
}

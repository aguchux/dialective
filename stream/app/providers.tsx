'use client';

import { useEffect } from 'react';
import { SessionProvider, signOut, useSession } from 'next-auth/react';
import { StoreProvider } from '@/store/Providers';
import { CatalogueSearchProvider } from '@/components/stream-catalogue/CatalogueSearchContext';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider refetchInterval={5 * 60} refetchOnWindowFocus>
      <InvalidSessionHandler />
      <StoreProvider>
        {/* Above the router so a search query survives navigation. */}
        <CatalogueSearchProvider>{children}</CatalogueSearchProvider>
      </StoreProvider>
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

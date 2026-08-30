'use client';

import { useEffect } from 'react';
import { SessionProvider, signOut, useSession } from 'next-auth/react';
import { StoreProvider } from '@/store/Providers';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider refetchInterval={5 * 60} refetchOnWindowFocus>
      <InvalidSessionHandler />
      <StoreProvider>{children}</StoreProvider>
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

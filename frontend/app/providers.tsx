'use client';

import { useEffect } from 'react';
import { SessionProvider, signOut, useSession } from 'next-auth/react';
import { ThemeProvider } from 'next-themes';
import { StoreProvider } from '@/store/Providers';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider refetchInterval={5 * 60} refetchOnWindowFocus>
      <InvalidSessionHandler />
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <StoreProvider>{children}</StoreProvider>
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

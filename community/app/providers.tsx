'use client';

import { SessionProvider } from 'next-auth/react';
import { StoreProvider } from '@/store/Providers';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider refetchInterval={5 * 60} refetchOnWindowFocus>
      <StoreProvider>{children}</StoreProvider>
    </SessionProvider>
  );
}

'use client';

import { SessionProvider } from 'next-auth/react';
import { StoreProvider } from '@/store/Providers';
import { AdNetworkScripts } from '@/components/AdNetworkScripts';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider refetchInterval={5 * 60} refetchOnWindowFocus>
      <StoreProvider>
        <AdNetworkScripts />
        {children}
      </StoreProvider>
    </SessionProvider>
  );
}

'use client';

import { SessionProvider } from 'next-auth/react';
import { StoreProvider } from '@/store/Providers';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <StoreProvider>{children}</StoreProvider>
    </SessionProvider>
  );
}

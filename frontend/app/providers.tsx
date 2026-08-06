'use client';

import { SessionProvider } from 'next-auth/react';
import { ThemeProvider } from 'next-themes';
import { StoreProvider } from '@/store/Providers';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <StoreProvider>{children}</StoreProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}

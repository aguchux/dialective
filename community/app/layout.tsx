import { Inter } from 'next/font/google';
import type { Metadata } from 'next';
import { Providers } from './providers';
import { CommunityShell } from '@/components/CommunityShell';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://community.dialectlibrary.com';
const description =
  'Ask questions. Share knowledge. Learn together with Dialect Library contributors.';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: 'Dialect Library Community',
  title: {
    default: 'Dialect Library Community',
    template: '%s | Dialect Library Community',
  },
  description,
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <Providers>
          <CommunityShell>{children}</CommunityShell>
        </Providers>
      </body>
    </html>
  );
}

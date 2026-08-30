import { Inter } from 'next/font/google';
import type { Metadata } from 'next';
import { Providers } from './providers';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: {
    default: 'Dialect Library Voice Stream',
    template: '%s | Dialect Library Voice Stream',
  },
  description:
    'Search, validate, curate, and securely stream licensed Dialect Library voice data into your model-training infrastructure.',
  robots: { index: false, follow: false }, // authenticated subscriber product, not a public marketing surface
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

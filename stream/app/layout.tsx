import { Inter } from 'next/font/google';
import type { Metadata, Viewport } from 'next';
import { Providers } from './providers';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  // Required for the relative openGraph/twitter image paths below: without
  // it Next resolves them against localhost, which every scraper then fails
  // to fetch. NEXT_PUBLIC_SITE_URL lets a preview deployment advertise its
  // own origin instead of production's.
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.streamdialect.com'),
  title: {
    default: 'Stream Dialect',
    template: '%s | Stream Dialect',
  },
  description:
    'Search, validate, curate, and securely stream licensed voice data into your model-training infrastructure.',
  robots: { index: true, follow: true },
  icons: {
    icon: [
      { url: '/logo-assets/favicon-16.png', sizes: '16x16', type: 'image/png' },
      { url: '/logo-assets/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/logo-assets/mark-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/logo-assets/mark-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/logo-assets/apple-touch-icon-180.png', sizes: '180x180', type: 'image/png' }],
  },
  // The share card carries the Stream Dialect wordmark, so a link pasted
  // into Slack, WhatsApp or LinkedIn shows the brand rather than whatever
  // the platform scrapes off the page.
  openGraph: {
    type: 'website',
    siteName: 'Stream Dialect',
    title: 'Stream Dialect',
    description: 'Licensed voice data for model training.',
    images: [
      {
        url: '/logo-assets/og-image-1200x630.png',
        width: 1200,
        height: 630,
        alt: 'Stream Dialect',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Stream Dialect',
    description: 'Licensed voice data for model training.',
    images: ['/logo-assets/twitter-card-1200x600.png'],
  },
};

export const viewport: Viewport = {
  // Matches --bg in globals.css. It was #f7f9fc, a blue-grey that belonged
  // to neither the page background nor the mark, so mobile browsers tinted
  // their chrome a shade the app never uses.
  themeColor: '#f7f5fa',
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

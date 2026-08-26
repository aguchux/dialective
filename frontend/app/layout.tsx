import { Inter } from 'next/font/google';
import type { Metadata } from 'next';
import { Providers } from './providers';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://dialectlibrary.com';
const description =
  'Dialect Library is a contributor platform for voice recordings and word translations in underrepresented languages and dialects.';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: 'Dialect Library',
  authors: [{ name: 'Dialect Library' }],
  creator: 'Dialect Library',
  publisher: 'Dialect Library',
  category: 'Language technology',
  title: {
    default: 'Dialect Library | Voice and Word Collection',
    template: '%s | Dialect Library',
  },
  description,
  keywords: [
    'dialect data',
    'voice data collection',
    'speech AI',
    'language data',
    'African languages',
    'AI voice training',
  ],
  manifest: '/site.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Dialect Library',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '32x32' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
    ],
    shortcut: '/favicon.ico',
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  openGraph: {
    type: 'website',
    locale: 'en_GB',
    url: '/',
    siteName: 'Dialect Library',
    title: 'Dialect Library | Voice and Word Collection',
    description,
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Dialect Library purple waveform logo with voice and word collection description',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Dialect Library | Voice and Word Collection',
    description,
    images: ['/og-image.png'],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={inter.variable}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

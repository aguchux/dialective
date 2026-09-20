import type { Metadata } from 'next';
import './globals.css';

const title = 'Dialect Library Connect 2026 | First Contributor Webinar';
const description =
  'Join our first contributor webinar in October 2026. Meet the people building inclusive voice AI, reserve a free place, or apply to speak.';

export const metadata: Metadata = {
  metadataBase: new URL('https://connect.dialectlibrary.com'),
  title,
  description,
  openGraph: {
    title,
    description,
    url: 'https://connect.dialectlibrary.com',
    siteName: 'Dialect Library Connect',
    type: 'website',
    images: ['/images/connect-hero-1.png'],
  },
  twitter: { card: 'summary_large_image', title, description },
  icons: { icon: '/logo-mark.png' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

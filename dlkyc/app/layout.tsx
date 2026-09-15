import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'DLKYC Identity Verification',
  description: 'Dialect Library identity verification',
  robots: { index: false, follow: false, noarchive: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-bg text-ink antialiased">{children}</body>
    </html>
  );
}

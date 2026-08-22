import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ChatDialect',
  description:
    'A Dialect Library voice-first conversational assistant with a locally rendered animated 3D face.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

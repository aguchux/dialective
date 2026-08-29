import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Speech Data Access',
  description:
    'Request responsibly collected voice recordings and word translations for speech recognition, voice assistants, and linguistic research.',
  alternates: { canonical: '/data-access' },
  openGraph: {
    url: '/data-access',
    title: 'Speech Data Access | Dialect Library',
    description:
      'Request responsibly collected voice recordings and word translations for speech recognition, voice assistants, and linguistic research.',
  },
};

export default function DataAccessLayout({ children }: { children: React.ReactNode }) {
  return children;
}
import type { Metadata } from 'next';
import { LandingPage } from '@/components/landing/LandingPage';

const description =
  'Contribute voice recordings and word translations that help speech technology understand underrepresented languages and dialects.';

export const metadata: Metadata = {
  alternates: { canonical: '/' },
  openGraph: {
    url: '/',
    title: 'Dialect Library | Voice and Word Collection',
    description,
  },
  twitter: { title: 'Dialect Library | Voice and Word Collection', description },
};

export default LandingPage;

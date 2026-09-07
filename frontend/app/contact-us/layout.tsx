import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Contact Us',
  description: 'Get in touch with Dialect Library -- send us a message and we’ll get back to you.',
  alternates: { canonical: '/contact-us' },
  openGraph: {
    url: '/contact-us',
    title: 'Contact Us | Dialect Library',
    description: 'Get in touch with Dialect Library -- send us a message and we’ll get back to you.',
  },
};

export default function ContactUsLayout({ children }: { children: React.ReactNode }) {
  return children;
}

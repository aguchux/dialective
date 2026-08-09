import Link from 'next/link';
import { BrandLogo } from '@/components/BrandLogo';

const footerLinks = [
  { href: '/terms', label: 'Terms of Use' },
  { href: '/privacy', label: 'Privacy Policy' },
  { href: '/cookies', label: 'Cookie Policy' },
];

export function LandingFooter() {
  return (
    <footer className="w-full border-t border-[rgba(5,5,5,0.1)] bg-white px-4 py-5 text-[#050505] md:px-8 md:py-[1.4rem]">
      <div className="mx-auto grid max-w-7xl items-start gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
        <div>
          <BrandLogo className="mb-2 text-lg text-[#050505]" size={34} />
          <p className="leading-snug text-[rgba(5,5,5,0.62)]">
            Voice and word collection for underrepresented dialects.
          </p>
        </div>
        <nav className="flex flex-wrap gap-x-4 gap-y-3" aria-label="Footer">
          {footerLinks.map((link) => (
            <Link
              className="text-[rgba(5,5,5,0.72)] no-underline transition-colors hover:text-[#050505]"
              href={link.href}
              key={link.href}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}

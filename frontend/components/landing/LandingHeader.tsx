import Link from 'next/link';
import { ThemeToggle } from '@/components/ThemeToggle';

const menuLinks = [
  { href: '/about', label: 'About Us' },
  { href: '/blog', label: 'Blog' },
  { href: '/faq', label: 'FAQs' },
];

export function LandingHeader() {
  return (
    <header className="w-full px-4 py-4 text-[#050505] md:px-8">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <Link className="text-2xl font-black no-underline" href="/">
            Dialect Library
          </Link>
          <nav className="hidden items-center gap-6 md:flex" aria-label="Primary">
            {menuLinks.map((link) => (
              <Link
                className="whitespace-nowrap font-medium text-[rgba(5,5,5,0.74)] no-underline transition-colors hover:text-[#050505]"
                href={link.href}
                key={link.href}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Link
            className="inline-flex min-h-[42px] items-center justify-center whitespace-nowrap rounded-full border-[1.5px] border-[#050505] bg-[rgba(255,255,255,0.1)] px-[1.15rem] py-[0.7rem] font-extrabold no-underline transition-colors hover:bg-[rgba(5,5,5,0.1)]"
            href="/login"
          >
            Login
          </Link>
          <Link
            className="inline-flex min-h-[42px] items-center justify-center whitespace-nowrap rounded-full border-[1.5px] border-accent bg-accent px-[1.15rem] py-[0.7rem] text-white no-underline transition-colors hover:border-accent-dark hover:bg-accent-dark hover:text-white"
            href="/register"
          >
            Start Earning
          </Link>
        </div>
      </div>
    </header>
  );
}

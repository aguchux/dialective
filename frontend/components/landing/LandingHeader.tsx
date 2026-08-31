'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import { useEffect, useRef, useState } from 'react';
import { BrandLogo } from '@/components/BrandLogo';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/DropdownMenu';
import { roleHomePath } from '@/lib/role-home';

const menuLinks = [
  { href: '/about', label: 'About Us' },
  { href: '/stream', label: 'Stream' },
  { href: '/blog', label: 'Blog' },
  { href: '/faq', label: 'FAQs' },
];

export function LandingHeader() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const isAuthenticated = status === 'authenticated';
  const homePath = roleHomePath(session?.user?.role, session?.user?.onboardingComplete);
  const email = session?.user?.email ?? '';
  const displayName =
    [session?.user?.firstName, session?.user?.lastName].filter(Boolean).join(' ') || email;
  const initial = displayName ? displayName[0].toUpperCase() : '?';

  const [pinned, setPinned] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const pastThreshold = useRef(0);

  useEffect(() => {
    // Measured once while the header is still in normal flow (unpinned) --
    // reading offsetHeight during the same render that flips `pinned` to
    // true would race the class-change commit to `position: fixed`, leaving
    // a frame where the header floats over the page with nothing reserving
    // its space underneath.
    const height = headerRef.current?.offsetHeight ?? 72;
    setHeaderHeight(height);
    pastThreshold.current = height;

    function handleScroll() {
      setPinned(window.scrollY >= pastThreshold.current);
    }

    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [isAuthenticated]);

  return (
    <>
      {pinned && <div style={{ height: headerHeight }} aria-hidden="true" />}
      <header
        ref={headerRef}
        className={`top-0 z-900 w-full px-4 py-3 text-[#050505] transition-colors duration-300 sm:px-6 md:px-8 ${
          pinned
            ? 'fixed bg-white/90 shadow-[0_2px_12px_rgba(5,5,5,0.08)] backdrop-blur-md'
            : 'relative bg-transparent'
        }`}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 sm:gap-4">
          <div className="flex items-center gap-4 sm:gap-6">
            <BrandLogo
              className="text-xl text-[#050505] sm:text-2xl"
              size={38}
              textClassName="hidden lg:inline"
            />
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
          <div className="flex items-center gap-2 sm:gap-3">
            {isAuthenticated ? (
              <>
                <DropdownMenu>
                  <DropdownMenuTrigger className="flex items-center gap-2 rounded-full border-[1.5px] border-[#050505] bg-[rgba(255,255,255,0.1)] py-1 pl-1 pr-2 transition-colors hover:bg-[rgba(5,5,5,0.1)] lg:pr-3">
                    <span className="grid size-8 place-items-center rounded-full bg-accent text-sm font-black text-white">
                      {initial}
                    </span>
                    <span className="hidden max-w-40 truncate font-bold lg:inline">
                      {displayName}
                    </span>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuLabel>{displayName}</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => router.push(homePath)}>
                      Dashboard
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem danger onSelect={() => signOut({ callbackUrl: '/' })}>
                      Sign out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Link
                  className="hidden min-h-[42px] items-center justify-center whitespace-nowrap rounded-full border-[1.5px] border-accent bg-accent px-[1.15rem] py-[0.7rem] text-white no-underline transition-colors hover:border-accent-dark hover:bg-accent-dark hover:text-white lg:inline-flex"
                  href={homePath}
                >
                  Go to dashboard
                </Link>
                <Link
                  aria-label="Go to dashboard"
                  className="grid size-9 shrink-0 place-items-center rounded-full border-[1.5px] border-accent bg-accent text-white no-underline transition-colors hover:border-accent-dark hover:bg-accent-dark lg:hidden"
                  href={homePath}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path
                      d="M3 10.5 12 3l9 7.5"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M5 9.5V21h14V9.5"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </Link>
              </>
            ) : (
              <>
                <Link
                  className="inline-flex min-h-[42px] items-center justify-center whitespace-nowrap rounded-full border-[1.5px] border-[#050505] bg-[rgba(255,255,255,0.1)] px-3 py-2 text-sm font-extrabold no-underline transition-colors hover:bg-[rgba(5,5,5,0.1)] sm:px-[1.15rem] sm:py-[0.7rem] sm:text-base"
                  href="/login"
                >
                  Login
                </Link>
                <Link
                  className="inline-flex min-h-[42px] items-center justify-center whitespace-nowrap rounded-full border-[1.5px] border-accent bg-accent px-3 py-2 text-sm text-white no-underline transition-colors hover:border-accent-dark hover:bg-accent-dark hover:text-white sm:px-[1.15rem] sm:py-[0.7rem] sm:text-base"
                  href="/register"
                >
                  Start Earning
                </Link>
              </>
            )}
            <button
              type="button"
              aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileMenuOpen}
              onClick={() => setMobileMenuOpen((open) => !open)}
              className="grid size-9 shrink-0 place-items-center rounded-full border-[1.5px] border-[#050505] bg-[rgba(255,255,255,0.1)] transition-colors hover:bg-[rgba(5,5,5,0.1)] md:hidden"
            >
              <span className="sr-only">{mobileMenuOpen ? 'Close menu' : 'Open menu'}</span>
              {mobileMenuOpen ? (
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                  <path
                    d="M1 1L17 17M17 1L1 17"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              ) : (
                <svg width="18" height="14" viewBox="0 0 18 14" fill="none" aria-hidden="true">
                  <path
                    d="M0 1H18M0 7H18M0 13H18"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              )}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <nav
            className="mx-auto mt-3 flex max-w-7xl flex-col gap-1 border-t border-[rgba(5,5,5,0.08)] pt-3 md:hidden"
            aria-label="Primary mobile"
          >
            {menuLinks.map((link) => (
              <Link
                className="rounded-lg px-2 py-2.5 font-medium text-[rgba(5,5,5,0.74)] no-underline transition-colors hover:bg-[rgba(5,5,5,0.05)] hover:text-[#050505]"
                href={link.href}
                key={link.href}
                onClick={() => setMobileMenuOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            {isAuthenticated && (
              <Link
                className="rounded-lg px-2 py-2.5 font-bold text-accent no-underline transition-colors hover:bg-[rgba(5,5,5,0.05)]"
                href={homePath}
                onClick={() => setMobileMenuOpen(false)}
              >
                Go to dashboard
              </Link>
            )}
          </nav>
        )}
      </header>
    </>
  );
}

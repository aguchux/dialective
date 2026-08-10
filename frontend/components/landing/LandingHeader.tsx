'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
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
  { href: '/blog', label: 'Blog' },
  { href: '/faq', label: 'FAQs' },
];

export function LandingHeader() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const isAuthenticated = status === 'authenticated';
  const homePath = roleHomePath(session?.user?.role, session?.user?.onboardingComplete);
  const email = session?.user?.email ?? '';
  const initial = email ? email[0].toUpperCase() : '?';

  return (
    <header className="w-full px-4 py-4 text-[#050505] md:px-8">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <BrandLogo className="text-2xl text-[#050505]" size={42} textClassName="hidden sm:inline" />
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
          {isAuthenticated ? (
            <>
              <DropdownMenu>
                <DropdownMenuTrigger className="flex items-center gap-2 rounded-full border-[1.5px] border-[#050505] bg-[rgba(255,255,255,0.1)] py-1 pl-1 pr-3 transition-colors hover:bg-[rgba(5,5,5,0.1)]">
                  <span className="grid size-8 place-items-center rounded-full bg-accent text-sm font-black text-white">
                    {initial}
                  </span>
                  <span className="hidden max-w-40 truncate font-bold sm:inline">{email}</span>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuLabel>{email}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => router.push(homePath)}>Dashboard</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem danger onSelect={() => signOut({ callbackUrl: '/' })}>
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Link
                className="inline-flex min-h-[42px] items-center justify-center whitespace-nowrap rounded-full border-[1.5px] border-accent bg-accent px-[1.15rem] py-[0.7rem] text-white no-underline transition-colors hover:border-accent-dark hover:bg-accent-dark hover:text-white"
                href={homePath}
              >
                Go to dashboard
              </Link>
            </>
          ) : (
            <>
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
            </>
          )}
        </div>
      </div>
    </header>
  );
}

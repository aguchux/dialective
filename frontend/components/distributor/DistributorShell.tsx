'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import { LayoutDashboard, Network, WalletCards, Store, Menu, X, Home, LogOut, ChevronDown } from 'lucide-react';
import { BrandLogo } from '@/components/BrandLogo';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/DropdownMenu';

const navItems = [
  { href: '/distributor', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/distributor/network', label: 'Network', icon: Network },
  { href: '/distributor/tokens', label: 'Tokens', icon: WalletCards },
  { href: '/distributor/market', label: 'Market', icon: Store },
];

export function DistributorShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const email = session?.user?.email ?? '';
  const displayName = [session?.user?.firstName, session?.user?.lastName].filter(Boolean).join(' ') || email;
  const initial = displayName ? displayName[0].toUpperCase() : '?';

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  return (
    <div className="grid min-h-screen bg-[#0b0710] text-white md:grid-cols-[240px_1fr]">
      <DistributorSidebar pathname={pathname} router={router} />

      <div
        className={`fixed inset-0 z-40 bg-black/60 transition-opacity md:hidden ${
          menuOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        }`}
        aria-hidden="true"
        onClick={() => setMenuOpen(false)}
      />
      <div
        className={`fixed inset-y-0 left-0 z-50 w-[min(84vw,280px)] transform transition-transform duration-200 md:hidden ${
          menuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <DistributorSidebar pathname={pathname} router={router} mobile onClose={() => setMenuOpen(false)} />
      </div>

      <div className="flex min-h-screen min-w-0 flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-white/10 bg-[#0b0710]/90 px-4 py-3 backdrop-blur md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              className="grid size-10 place-items-center rounded-lg border border-white/15 text-white transition-colors hover:bg-white/10 md:hidden"
              type="button"
              aria-label="Open distributor menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(true)}
            >
              <Menu className="size-[18px]" />
            </button>
            <div className="md:hidden">
              <BrandLogo size={28} className="text-white" textClassName="hidden text-sm font-black sm:inline" />
            </div>
            <span className="hidden text-lg font-black md:inline">Distributor Panel</span>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-2 rounded-lg border border-white/15 py-1 pl-1 pr-2.5 transition-colors hover:bg-white/10">
              <span className="grid size-7 place-items-center rounded-full bg-[#7b1ec9] text-sm font-black text-white">{initial}</span>
              <span className="hidden max-w-40 truncate text-sm font-bold sm:inline">{displayName}</span>
              <ChevronDown className="size-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel>{displayName}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => router.push('/')}>
                <Home className="size-4" />
                Back to site
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem danger onSelect={() => signOut({ callbackUrl: '/' })}>
                <LogOut className="size-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        <main className="min-w-0 flex-1 px-4 py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}

function DistributorSidebar({
  pathname,
  router,
  mobile = false,
  onClose,
}: {
  pathname: string;
  router: ReturnType<typeof useRouter>;
  mobile?: boolean;
  onClose?: () => void;
}) {
  return (
    <aside className={`${mobile ? 'flex h-full' : 'hidden md:flex'} flex-col gap-1 border-r border-white/10 bg-[#151019] p-4 text-white`}>
      <div className="mb-4 flex items-center justify-between px-1">
        <BrandLogo className="text-white" textClassName="text-base" size={32} />
        {mobile && (
          <button className="grid size-9 place-items-center rounded-lg text-white/70 hover:bg-white/5 hover:text-white" onClick={onClose} type="button" aria-label="Close distributor menu">
            <X className="size-[18px]" />
          </button>
        )}
      </div>
      <nav className="grid gap-1 overflow-y-auto">
        {navItems.map((item) => {
          const active = item.href === '/distributor' ? pathname === item.href : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 font-bold no-underline transition-colors ${
                active ? 'bg-white/10 text-white' : 'text-white/70 hover:bg-white/5 hover:text-white'
              }`}
            >
              <item.icon className="size-[18px]" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <button
        className="mt-auto flex items-center gap-3 rounded-lg px-3 py-2.5 font-bold text-white/70 transition-colors hover:bg-white/5 hover:text-white"
        onClick={() => router.push('/')}
        type="button"
      >
        <Home className="size-[18px]" />
        Back to site
      </button>

      <button
        className="flex items-center gap-3 rounded-lg px-3 py-2.5 font-bold text-white/70 transition-colors hover:bg-white/5 hover:text-white"
        onClick={() => signOut({ callbackUrl: '/' })}
        type="button"
      >
        <LogOut className="size-[18px]" />
        Sign out
      </button>
    </aside>
  );
}

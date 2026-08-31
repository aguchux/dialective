'use client';

import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { useState } from 'react';
import { BrandLogo } from './BrandLogo';

const navigation = [
  { href: '/#features', label: 'Features' },
  { href: '/#stream-decks', label: 'Stream Decks' },
  { href: '/#validation', label: 'Validation' },
  { href: '/#api', label: 'API' },
  { href: '/pricing', label: 'Pricing' },
];

export function StreamMarketingHeader() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-[#061632] text-white">
      <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <BrandLogo className="text-base text-white sm:text-lg" size={32} textClassName="whitespace-nowrap" />
        <nav aria-label="Primary navigation" className="hidden items-center gap-6 lg:flex">
          {navigation.map((item) => <Link className="text-sm font-bold text-slate-200 no-underline transition-colors hover:text-cyan-300" href={item.href} key={item.href}>{item.label}</Link>)}
        </nav>
        <div className="hidden items-center gap-3 lg:flex"><Link className="text-sm font-bold text-white no-underline hover:text-cyan-200" href="/login">Sign in</Link><Link className="inline-flex min-h-10 items-center justify-center rounded-lg bg-[#147af3] px-4 py-2 text-sm font-extrabold text-white no-underline transition-colors hover:bg-[#0c60cc]" href="/register">Get started</Link></div>
        <button aria-controls="stream-mobile-nav" aria-expanded={open} aria-label={open ? 'Close navigation' : 'Open navigation'} className="grid size-10 place-items-center rounded-lg border border-white/20 text-white transition-colors hover:bg-white/10 lg:hidden" onClick={() => setOpen((value) => !value)} type="button">{open ? <X aria-hidden="true" className="size-5" /> : <Menu aria-hidden="true" className="size-5" />}</button>
      </div>
      {open && <nav className="border-t border-white/10 px-4 py-3 lg:hidden" id="stream-mobile-nav"><div className="mx-auto grid max-w-7xl gap-1">{navigation.map((item) => <Link className="rounded-lg px-3 py-3 text-sm font-bold text-slate-100 no-underline hover:bg-white/10" href={item.href} key={item.href} onClick={() => setOpen(false)}>{item.label}</Link>)}<div className="mt-2 grid grid-cols-2 gap-2 border-t border-white/10 pt-3"><Link className="inline-flex min-h-10 items-center justify-center rounded-lg border border-white/20 text-sm font-bold text-white no-underline" href="/login" onClick={() => setOpen(false)}>Sign in</Link><Link className="inline-flex min-h-10 items-center justify-center rounded-lg bg-[#147af3] text-sm font-extrabold text-white no-underline" href="/register" onClick={() => setOpen(false)}>Get started</Link></div></div></nav>}
    </header>
  );
}

'use client';

import { Bell, Building2, ChevronDown, Menu, Search } from 'lucide-react';

export function StreamTopbar({
  onMenu,
  searchTerm,
  onSearchChange,
}: {
  onMenu: () => void;
  searchTerm: string;
  onSearchChange: (value: string) => void;
}) {
  return (
    <header className="sticky top-0 z-30 flex min-h-[72px] items-center gap-3 border-b border-catalogue-line bg-catalogue-bg/95 px-4 backdrop-blur-md sm:px-5 lg:px-7">
      <button
        aria-label="Open navigation"
        className="grid size-10 shrink-0 place-items-center rounded-lg text-catalogue-muted hover:bg-catalogue-surface-hover hover:text-catalogue-ink md:hidden"
        onClick={onMenu}
        type="button"
      >
        <Menu aria-hidden="true" className="size-5" />
      </button>
      <label className="relative min-w-0 flex-1">
        <span className="sr-only">Search voice catalogue</span>
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-catalogue-muted"
        />
        <input
          className="h-10 w-full rounded-lg border border-catalogue-line bg-catalogue-surface px-10 pr-20 text-sm text-catalogue-ink outline-none placeholder:text-catalogue-dim focus:border-catalogue-blue focus:ring-2 focus:ring-catalogue-blue/15"
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search voices, dialects, speakers, or collections…"
          value={searchTerm}
        />
        <span className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 items-center gap-1 text-[10px] text-catalogue-dim sm:flex">
          <kbd className="rounded border border-catalogue-line-strong px-1.5 py-0.5">⌘</kbd>
          <kbd className="rounded border border-catalogue-line-strong px-1.5 py-0.5">K</kbd>
        </span>
      </label>
      <div className="hidden items-center gap-2 sm:flex">
        <button
          aria-label="Choose organization"
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-catalogue-line bg-catalogue-surface px-3 text-xs font-semibold text-catalogue-ink hover:bg-catalogue-surface-hover"
          type="button"
        >
          <Building2 aria-hidden="true" className="size-4 text-catalogue-muted" />
          <span className="hidden lg:inline">Dialect Labs Org</span>
          <ChevronDown aria-hidden="true" className="size-3.5 text-catalogue-muted" />
        </button>
        <button
          aria-label="Notifications"
          className="relative grid size-10 place-items-center rounded-lg border border-catalogue-line bg-catalogue-surface text-catalogue-muted hover:bg-catalogue-surface-hover hover:text-catalogue-ink"
          type="button"
        >
          <Bell aria-hidden="true" className="size-[18px]" />
          <span className="absolute right-2.5 top-2 size-1.5 rounded-full bg-catalogue-blue-bright" />
        </button>
        <span className="grid size-10 place-items-center rounded-full border-2 border-catalogue-blue/40 bg-catalogue-blue-soft text-sm font-bold text-catalogue-ink">
          DL
        </span>
      </div>
    </header>
  );
}

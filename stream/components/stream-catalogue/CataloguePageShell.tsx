'use client';

import { useState, type ReactNode } from 'react';
import { pinnedCollections } from './mock-data';
import { StreamSidebar } from './StreamSidebar';
import { StreamTopbar } from './StreamTopbar';

export function CataloguePageShell({
  children,
  description,
  icon,
  title,
}: {
  children?: ReactNode;
  description?: string;
  icon?: ReactNode;
  title: string;
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  return (
    <div className="stream-catalogue min-h-screen w-full overflow-x-hidden bg-catalogue-bg text-catalogue-ink">
      <div className="flex min-h-screen md:grid md:grid-cols-[260px_minmax(0,1fr)]">
        <StreamSidebar
          mobileOpen={mobileMenuOpen}
          onClose={() => setMobileMenuOpen(false)}
          pinnedCollections={pinnedCollections}
        />
        {mobileMenuOpen && (
          <button
            aria-label="Close navigation backdrop"
            className="fixed inset-0 z-40 bg-black/60 md:hidden"
            onClick={() => setMobileMenuOpen(false)}
            type="button"
          />
        )}

        <main className="stream-catalogue-scrollbar min-w-0 overflow-y-auto">
          <StreamTopbar
            onMenu={() => setMobileMenuOpen(true)}
            onSearchChange={setSearchTerm}
            searchTerm={searchTerm}
          />
          <div className="mx-auto grid min-w-0 max-w-[1360px] gap-5 px-4 py-5 sm:px-5 lg:px-7">
            <div>
              <h1 className="flex items-center gap-2.5 text-xl font-bold text-catalogue-ink sm:text-2xl">
                {icon && (
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-catalogue-blue/20 text-catalogue-blue-bright ring-1 ring-inset ring-catalogue-blue/40 sm:size-9">
                    {icon}
                  </span>
                )}
                {title}
              </h1>
              {description && <p className="mt-1 text-sm text-catalogue-muted">{description}</p>}
            </div>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

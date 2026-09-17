'use client';

import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { usePathname } from 'next/navigation';
import { canAccessPath } from '@/lib/route-access';

const TABS = [
  { href: '/settings', label: 'General' },
  { href: '/settings/organization', label: 'Organization' },
  { href: '/settings/billing', label: 'Billing' },
  { href: '/settings/security', label: 'Security' },
  { href: '/settings/notifications', label: 'Notifications' },
  { href: '/settings/integrations', label: 'Integrations' },
  { href: '/settings/advanced', label: 'Advanced' },
];

export function SettingsTabs() {
  const pathname = usePathname();
  const { data: session } = useSession();

  return (
    <nav aria-label="Settings sections" className="stream-catalogue-scrollbar flex min-w-0 gap-1 overflow-x-auto border-b border-catalogue-line">
      {TABS.filter((tab) => canAccessPath(session?.user.orgRole, tab.href)).map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            aria-current={active ? 'page' : undefined}
            className={`shrink-0 border-b-2 px-3 pb-2.5 text-sm font-semibold no-underline transition-colors ${
              active
                ? 'border-catalogue-blue text-catalogue-blue-bright'
                : 'border-transparent text-catalogue-muted hover:text-catalogue-ink'
            }`}
            href={tab.href}
            key={tab.href}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

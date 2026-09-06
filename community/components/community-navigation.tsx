'use client';

import type { ReactNode } from 'react';
import { ArrowLeft, Hash } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { CommunitySpace } from '@/store/api';
import { IconButton } from './ui';
import { getSpaceTone } from '@/lib/community-format';

export function BackLink({
  href = '/',
  label = 'Back to Community',
}: {
  href?: string;
  label?: string;
}) {
  return (
    <Link
      className="mb-5 inline-flex min-h-11 items-center gap-2 text-sm font-extrabold text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35"
      href={href}
    >
      <ArrowLeft aria-hidden="true" className="size-5" />
      {label}
    </Link>
  );
}

export function MobileBackButton() {
  const router = useRouter();
  return (
    <IconButton label="Go back" onClick={() => router.back()}>
      <ArrowLeft aria-hidden="true" className="size-5" />
    </IconButton>
  );
}

export function SpacePill({ space }: { space: Pick<CommunitySpace, 'name' | 'slug'> }) {
  const tone = getSpaceTone(space.slug);
  const classes = {
    blue: 'bg-space-blue text-space-blue-ink',
    purple: 'bg-space-purple text-space-purple-ink',
    mint: 'bg-space-mint text-space-mint-ink',
    green: 'bg-space-green text-space-green-ink',
    pink: 'bg-space-pink text-space-pink-ink',
    orange: 'bg-space-orange text-space-orange-ink',
  };
  return (
    <Link
      className={`inline-flex max-w-full min-h-9 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 ${classes[tone]}`}
      href={`/spaces/${space.slug}`}
    >
      <Hash aria-hidden="true" className="size-3.5" />
      <span className="truncate">{space.name}</span>
    </Link>
  );
}

export function SectionHeading({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-xl font-black tracking-tight text-ink">{title}</h2>
      {action}
    </div>
  );
}

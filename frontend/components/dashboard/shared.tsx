import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

/**
 * Small presentational primitives shared by both the trainer dashboard
 * (components/trainer/TrainerDashboard.tsx) and other role dashboards (e.g.
 * the distributor dashboard's P2P market view, components/p2p/MarketView.tsx).
 * Kept in their own file, not re-exported from TrainerDashboard.tsx, so a
 * page that only needs one of these doesn't pull in that whole 2000+ line
 * module (word training, submissions, earnings, etc.) through the import
 * graph -- Next's bundler chunks per-module, not per-export, so importing
 * even one named export from a large file still bundles the rest of it.
 */

export const cardClass = 'min-w-0 rounded-lg border border-line bg-surface shadow-[0_8px_24px_rgba(31,25,41,0.04)]';

export function SectionTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return <div className="mb-3"><h3 className="text-lg font-black md:text-xl">{title}</h3><p className="mt-0.5 text-sm text-muted">{subtitle}</p></div>;
}

export function EmptyPanel({ icon: Icon, title, actionHref, actionLabel, unframed = false }: { icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>; title: string; actionHref?: string; actionLabel?: string; unframed?: boolean }) {
  return (
    <div className={`${unframed ? '' : cardClass} grid min-h-48 place-items-center p-6 text-center`}>
      <div className="grid justify-items-center gap-3">
        <span className="grid size-11 place-items-center rounded-lg bg-surface-muted text-muted"><Icon className="size-5" aria-hidden="true" /></span>
        <p className="font-black">{title}</p>
        {actionHref && actionLabel && <Link className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-line px-3 font-extrabold text-ink hover:bg-surface-muted" href={actionHref}>{actionLabel}<ArrowRight className="size-4" aria-hidden="true" /></Link>}
      </div>
    </div>
  );
}

export function Avatar({ email, image, large = false }: { email: string; image?: string | null; large?: boolean }) {
  const size = large ? 'size-14 text-lg' : 'size-8 text-sm';
  if (image) {
    return <Image alt="" className={`${size} rounded-full border border-line object-cover`} height={large ? 56 : 32} src={image} unoptimized width={large ? 56 : 32} />;
  }
  return <span className={`${size} grid shrink-0 place-items-center rounded-full bg-accent font-black text-white`} aria-hidden="true">{email.charAt(0).toUpperCase()}</span>;
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value));
}

export function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

import { KycStatus } from '@/store/api';

export function ProviderBadge({ provider }: { provider: string }) {
  const isSelf = provider === 'self';
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-black ${
        isSelf ? 'bg-violet-50 text-violet-700' : 'bg-sky-50 text-sky-700'
      }`}
    >
      {isSelf ? 'DLKYC' : 'Didit'}
    </span>
  );
}

export function StatusBadge({ status }: { status: KycStatus }) {
  const styles: Record<KycStatus, string> = {
    NOT_STARTED: 'bg-slate-100 text-slate-700',
    IN_PROGRESS: 'bg-amber-50 text-amber-700',
    IN_REVIEW: 'bg-amber-50 text-amber-700',
    APPROVED: 'bg-emerald-50 text-emerald-700',
    DECLINED: 'bg-red-50 text-red-700',
    ABANDONED: 'bg-slate-100 text-slate-700',
    EXPIRED: 'bg-slate-100 text-slate-700',
  };
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-black ${styles[status]}`}>
      {status.replace(/_/g, ' ').toLowerCase()}
    </span>
  );
}

export function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );
}

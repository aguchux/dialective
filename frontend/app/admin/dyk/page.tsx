import Link from 'next/link';
import { AdminShell } from '@/components/admin/AdminShell';
import { DykNoticesPanel } from './DykNoticesPanel';

export const metadata = {
  title: 'Do you know? notices | Admin',
};

export default function AdminDykPage() {
  return (
    <AdminShell>
      <div className="grid gap-2">
        <h1 className="text-3xl font-black">Do you know? notices</h1>
        <p className="leading-relaxed text-muted">
          Create and manage the promotional cards shown to trainers and distributors. Turn notices
          on/off and set the reminder interval and display cap on the{' '}
          <Link className="font-bold text-accent underline" href="/admin/settings">
            settings page
          </Link>{' '}
          (Do you know? tab).
        </p>
      </div>
      <DykNoticesPanel />
    </AdminShell>
  );
}

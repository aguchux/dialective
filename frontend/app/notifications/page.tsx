'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { AdminShell } from '@/components/admin/AdminShell';
import { DistributorShell } from '@/components/distributor/DistributorShell';
import { NotificationListPanel } from '@/components/notifications/NotificationListPanel';

/**
 * Trainers already have a dedicated in-shell notifications view at
 * /dashboard?view=notifications (TrainerDashboard.tsx renders its own header
 * and can't be wrapped like AdminShell/DistributorShell), so this route
 * redirects them there instead of duplicating a second header/shell.
 */
export default function NotificationsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const role = session?.user?.role;

  const redirectToDashboard = role === 'TRAINER' || role === 'PARTNER';

  useEffect(() => {
    if (redirectToDashboard) router.replace('/dashboard?view=notifications');
  }, [redirectToDashboard, router]);

  if (status === 'loading' || redirectToDashboard) {
    return <div className="dashboard-theme min-h-screen bg-bg" />;
  }

  if (role === 'DISTRIBUTOR') {
    return (
      <DistributorShell>
        <NotificationListPanel />
      </DistributorShell>
    );
  }

  return (
    <AdminShell>
      <NotificationListPanel />
    </AdminShell>
  );
}

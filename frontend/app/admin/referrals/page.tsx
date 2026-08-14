'use client';

import Link from 'next/link';
import { useGetReferralsQuery } from '@/store/api';
import { AdminShell } from '@/components/admin/AdminShell';

export default function AdminReferralsPage() {
  const { data: referrals, isLoading: isLoadingReferrals } = useGetReferralsQuery();

  return (
    <AdminShell>
      <div className="grid gap-6">
        <div className="grid gap-2">
          <h1 className="text-3xl font-black">Referrals</h1>
          <p className="leading-relaxed text-muted">
            See who is earning referral bonuses. Bonus rates are managed on the{' '}
            <Link className="font-bold text-accent hover:text-accent-dark" href="/admin/settings">
              Settings page
            </Link>
            .
          </p>
        </div>

        <section className="grid gap-3 rounded-lg border border-line bg-white p-5 shadow-[0_2px_8px_rgba(27,31,27,0.05)]">
          <h2 className="text-2xl leading-snug">Referrers</h2>
          {isLoadingReferrals && <p className="text-muted">Loading...</p>}
          {referrals && referrals.length === 0 && <p className="text-muted">No referral bonuses yet.</p>}
          {referrals && referrals.length > 0 && (
            <div className="grid gap-2">
              {referrals.map((r) => (
                <div className="grid gap-1 rounded-lg border border-line bg-surface p-4" key={r.referralCode}>
                  <p className="font-extrabold">{r.referrerEmail}</p>
                  <p className="text-sm text-muted">
                    {r.referredUsers.length} referred &middot; {r.bonusEventCount} bonus events &middot; earned{' '}
                    {r.totalCommission} DL
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </AdminShell>
  );
}

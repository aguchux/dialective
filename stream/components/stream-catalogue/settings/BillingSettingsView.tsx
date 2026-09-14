'use client';

import { useGetBillingUsageQuery, useGetSubscriptionQuery } from '@/store/api';
import { Skeleton } from '../primitives';
import { SettingsCard } from './SettingsCard';

function formatBytes(bytes: string): string {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function BillingSettingsView() {
  const { data: subscription, isLoading: subLoading } = useGetSubscriptionQuery();
  const { data: usage, isLoading: usageLoading } = useGetBillingUsageQuery();

  const plan = subscription?.plan;

  if (subLoading) {
    return (
      <SettingsCard title="Current Plan">
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-6 w-full" />
      </SettingsCard>
    );
  }

  return (
    <div className="grid gap-5">
      <SettingsCard description="Your organization's active subscription plan." title="Current Plan">
        {plan ? (
          <div className="grid gap-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-lg font-bold text-catalogue-ink">{plan.name}</p>
                <p className="text-sm text-catalogue-muted">${plan.monthlyUsdAmount}/month</p>
              </div>
              <span
                className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-bold ${
                  subscription?.status === 'ACTIVE'
                    ? 'bg-catalogue-green/15 text-catalogue-green'
                    : 'bg-catalogue-yellow/15 text-catalogue-yellow'
                }`}
              >
                {subscription?.status}
              </span>
            </div>
            {plan.features.length > 0 && (
              <ul className="grid gap-1.5 text-sm text-catalogue-muted">
                {plan.features.map((feature) => (
                  <li className="flex items-center gap-2" key={feature}>
                    <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-catalogue-blue" />
                    {feature}
                  </li>
                ))}
              </ul>
            )}
            {subscription?.currentPeriodEnd && (
              <p className="text-xs text-catalogue-dim">
                {subscription.cancelAtPeriodEnd ? 'Cancels' : 'Renews'} on{' '}
                {new Date(subscription.currentPeriodEnd).toLocaleDateString('en-US', {
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-catalogue-muted">No active subscription.</p>
        )}
      </SettingsCard>

      <SettingsCard description="Usage for the current billing period." title="Usage">
        {usageLoading ? (
          <Skeleton className="h-14 w-full" />
        ) : usage ? (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-semibold text-catalogue-muted">Data Streamed</p>
              <p className="mt-1 text-xl font-bold text-catalogue-ink">{formatBytes(usage.bytesUsed)}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-catalogue-muted">API Requests</p>
              <p className="mt-1 text-xl font-bold text-catalogue-ink">
                {usage.requestsUsed.toLocaleString('en-US')}
              </p>
            </div>
            <p className="col-span-2 text-xs text-catalogue-dim">
              Since{' '}
              {new Date(usage.periodStart).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </p>
          </div>
        ) : (
          <p className="text-sm text-catalogue-muted">No usage recorded yet.</p>
        )}
      </SettingsCard>
    </div>
  );
}

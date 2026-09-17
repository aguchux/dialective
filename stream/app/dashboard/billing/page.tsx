'use client';

import { useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useCreateCheckoutSessionMutation, useGetSubscriptionQuery } from '@/store/api';
import { Card, PageHeading, PrimaryButton } from '@/components/ui';
import { CHECKOUT_ROLES } from '@/lib/route-access';

const PLAN_KEYS = ['starter', 'professional', 'enterprise'] as const;

export default function BillingPage() {
  const { data: session } = useSession();
  const canManageBilling = Boolean(
    session?.user.orgRole && CHECKOUT_ROLES.includes(session.user.orgRole),
  );
  const searchParams = useSearchParams();
  const checkoutResult = searchParams.get('checkout');
  const { data: subscription, refetch: refetchSubscription } = useGetSubscriptionQuery();
  const [createCheckoutSession, { isLoading }] = useCreateCheckoutSessionMutation();

  async function subscribe(planKey: string) {
    const result = await createCheckoutSession({ planKey }).unwrap();
    if (result.checkoutUrl) {
      window.location.href = result.checkoutUrl;
      return;
    }
    await refetchSubscription();
  }

  return (
    <div>
      <PageHeading subtitle="Manage your monthly Voice Stream subscription." title="Subscription & Billing" />

      {checkoutResult === 'success' && (
        <Card className="mb-6 border-success/30 bg-success/5 p-4">
          <p className="text-sm font-bold text-success">
            Checkout complete. Your subscription will activate shortly.
          </p>
        </Card>
      )}
      {checkoutResult === 'canceled' && (
        <Card className="mb-6 p-4">
          <p className="text-sm text-muted">Checkout was canceled.</p>
        </Card>
      )}

      <Card className="mb-6 p-5">
        <p className="text-xs font-bold uppercase tracking-wide text-muted">Current subscription</p>
        <p className="mt-1 text-lg font-black text-ink">
          {subscription ? `${subscription.plan.name} — ${subscription.status}` : 'No active subscription'}
        </p>
        {subscription?.currentPeriodEnd && (
          <p className="mt-1 text-sm text-muted">
            Renews {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
          </p>
        )}
      </Card>

      {canManageBilling ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {PLAN_KEYS.map((key) => (
          <Card className="p-5" key={key}>
            <p className="text-lg font-black capitalize text-ink">{key}</p>
            <p className="mt-1 text-sm text-muted">Monthly billing.</p>
            <PrimaryButton
              className="mt-4 w-full"
              disabled={isLoading}
              onClick={() => void subscribe(key)}
              type="button"
            >
              {subscription?.plan.key === key ? 'Current plan' : `Choose ${key}`}
            </PrimaryButton>
          </Card>
          ))}
        </div>
      ) : (
        <Card className="p-5">
          <p className="text-sm text-muted">
            Subscription changes are available to organization owners and billing managers.
          </p>
        </Card>
      )}
    </div>
  );
}

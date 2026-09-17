'use client';

import { useEffect, useState } from 'react';
import { Check, Plus, X } from 'lucide-react';
import {
  ApiAccessTokenSummary,
  IsvcConfidence,
  SubscriptionPlan,
  normalizeErrorMessage,
  useDeleteApiAccessTokenMutation,
  useDeleteSubscriptionPlanMutation,
  useGetApiAccessTokensQuery,
  useGetPlatformSettingsQuery,
  useGetSubscriptionPlansQuery,
  useSetApiAccessTokenMutation,
  useUpdatePlatformSettingsMutation,
  useUpsertSubscriptionPlanMutation,
} from '@/store/api';

const CONFIDENCE_TIER_OPTIONS: { value: IsvcConfidence | ''; label: string }[] = [
  { value: '', label: 'None (full catalogue access)' },
  { value: 'ESTABLISHED', label: 'Established or higher' },
  { value: 'HIGH', label: 'High Confidence or higher' },
  { value: 'VERY_HIGH', label: 'Premium Verified (VERY_HIGH) only' },
];
import { ActionButton } from '@/components/ui/ActionButton';

const inputClass =
  'min-h-10 w-full rounded-lg border border-line bg-white px-3 py-2.5 text-ink dark:bg-surface-muted';
const primaryButtonClass =
  'inline-flex min-h-10 items-center justify-center rounded-lg border border-accent bg-accent px-3.5 py-2.5 font-bold text-white transition-colors hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60';
const dangerButtonClass =
  'inline-flex min-h-10 items-center justify-center rounded-lg border border-line bg-white px-3.5 py-2.5 font-bold text-danger transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60';

const STRIPE_KEY_LABELS: Record<string, { label: string; description: string }> = {
  stripe_secret_key: {
    label: 'Stripe Secret Key',
    description:
      'From dashboard.stripe.com -> Developers -> API keys. Used to create Checkout sessions and Customers for Voice Stream subscribers.',
  },
  stripe_webhook_secret: {
    label: 'Stripe Webhook Signing Secret',
    description:
      'From the webhook endpoint configured for /api/v1/voice-stream/billing/webhooks/stripe. Verifies that incoming webhook events actually came from Stripe.',
  },
};

const STRIPE_KEYS = ['stripe_secret_key', 'stripe_webhook_secret'];

function StripeKeyRow({ token }: { token: ApiAccessTokenSummary }) {
  const [setToken, { isLoading: isSaving }] = useSetApiAccessTokenMutation();
  const [deleteToken, { isLoading: isDeleting }] = useDeleteApiAccessTokenMutation();
  const [value, setValue] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const meta = STRIPE_KEY_LABELS[token.key] ?? { label: token.key, description: '' };

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setError(null);
    try {
      await setToken({ key: token.key, value }).unwrap();
      setValue('');
      setMessage('Saved.');
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to save.'));
    }
  }

  async function handleRemove() {
    setMessage(null);
    setError(null);
    try {
      await deleteToken(token.key).unwrap();
      setMessage('Removed.');
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to remove.'));
    }
  }

  return (
    <div className="grid gap-3 rounded-lg border border-line bg-surface-muted p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-bold">{meta.label}</p>
          {meta.description && (
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted">{meta.description}</p>
          )}
        </div>
        <span
          className={`shrink-0 rounded-full px-3 py-1 text-sm font-bold ${
            token.isSet ? 'bg-accent/10 text-accent-dark' : 'bg-danger/10 text-danger'
          }`}
        >
          {token.isSet ? `Set (...${token.lastFour})` : 'Not set'}
        </span>
      </div>

      {token.isSet && token.updatedAt && (
        <p className="text-sm text-muted">
          Last updated {new Date(token.updatedAt).toLocaleString()}
          {token.updatedByEmail ? ` by ${token.updatedByEmail}` : ''}
        </p>
      )}

      <form className="flex flex-wrap items-center gap-2" onSubmit={handleSave}>
        <input
          className="min-w-0 flex-1 rounded-lg border border-line px-3 py-2.5"
          onChange={(e) => setValue(e.target.value)}
          placeholder={token.isSet ? 'Enter a new value to rotate' : 'Paste value'}
          type="password"
          value={value}
        />
        <ActionButton
          className={primaryButtonClass}
          disabled={!value.trim()}
          pending={isSaving}
          pendingLabel="Saving"
          type="submit"
        >
          {token.isSet ? 'Rotate' : 'Save'}
        </ActionButton>
        {token.isSet && (
          <ActionButton
            className={dangerButtonClass}
            onClick={handleRemove}
            pending={isDeleting}
            pendingLabel="Removing"
            type="button"
          >
            Remove
          </ActionButton>
        )}
      </form>

      {message && <p className="text-sm leading-relaxed text-accent-dark">{message}</p>}
      {error && (
        <p className="text-sm leading-relaxed text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function emptyPlanForm() {
  return {
    key: '',
    name: '',
    stripePriceId: '',
    monthlyUsdAmount: '',
    maxStreamDecks: '',
    maxTeamMembers: '',
    minIsvcConfidence: '' as IsvcConfidence | '',
    monthlyByteQuotaGb: '',
    monthlyRequestQuota: '',
    features: [] as string[],
    active: true,
  };
}

const BYTES_PER_GB = 1024 * 1024 * 1024;

function planToForm(plan: SubscriptionPlan) {
  return {
    key: plan.key,
    name: plan.name,
    stripePriceId: plan.stripePriceId ?? '',
    monthlyUsdAmount: plan.monthlyUsdAmount,
    maxStreamDecks: plan.maxStreamDecks?.toString() ?? '',
    maxTeamMembers: plan.maxTeamMembers?.toString() ?? '',
    minIsvcConfidence: (plan.minIsvcConfidence ?? '') as IsvcConfidence | '',
    monthlyByteQuotaGb: plan.monthlyByteQuota
      ? (Number(plan.monthlyByteQuota) / BYTES_PER_GB).toString()
      : '',
    monthlyRequestQuota: plan.monthlyRequestQuota?.toString() ?? '',
    features: plan.features ?? [],
    active: plan.active,
  };
}

/** Add/remove/edit free-text comparison bullets for a plan (e.g. "Priority support"). Display-only, not tied to any enforced limit. */
function FeatureListEditor({
  features,
  onChange,
}: {
  features: string[];
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState('');

  function addFeature() {
    const value = draft.trim();
    if (!value) return;
    onChange([...features, value]);
    setDraft('');
  }

  function removeFeature(index: number) {
    onChange(features.filter((_, i) => i !== index));
  }

  return (
    <div className="grid gap-2 sm:col-span-2">
      <span className="text-sm font-bold">Comparison features</span>
      {features.length > 0 && (
        <ul className="grid gap-1.5">
          {features.map((feature, index) => (
            <li
              className="flex items-center justify-between gap-2 rounded-lg border border-line bg-white px-3 py-2"
              key={`${feature}-${index}`}
            >
              <span className="text-sm">{feature}</span>
              <button
                aria-label={`Remove "${feature}"`}
                className="grid size-7 shrink-0 place-items-center rounded-md text-muted transition-colors hover:bg-danger/10 hover:text-danger"
                onClick={() => removeFeature(index)}
                type="button"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <input
          className={inputClass}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addFeature();
            }
          }}
          placeholder="e.g. Priority support"
          value={draft}
        />
        <button
          className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg border border-line bg-white px-3.5 py-2.5 font-bold text-ink transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!draft.trim()}
          onClick={addFeature}
          type="button"
        >
          <Plus className="size-4" aria-hidden="true" />
          Add
        </button>
      </div>
      <p className="text-xs text-muted">
        Shown as a bullet list on this plan for side-by-side comparison. Display-only -- not
        enforced.
      </p>
    </div>
  );
}

function PlanForm({
  initial,
  isNew,
  onDone,
}: {
  initial: ReturnType<typeof emptyPlanForm>;
  isNew: boolean;
  onDone: () => void;
}) {
  const [form, setForm] = useState(initial);
  const [upsert, { isLoading: isSaving }] = useUpsertSubscriptionPlanMutation();
  const [error, setError] = useState<string | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const monthlyUsdAmount = Number(form.monthlyUsdAmount);
    if (!form.key.trim() || !form.name.trim()) {
      setError('Key and name are required.');
      return;
    }
    if (!Number.isFinite(monthlyUsdAmount) || monthlyUsdAmount < 0) {
      setError('Monthly USD amount must be zero or greater.');
      return;
    }
    if (monthlyUsdAmount > 0 && !form.stripePriceId.trim()) {
      setError('Stripe Price id is required for a paid plan.');
      return;
    }
    try {
      await upsert({
        key: form.key.trim(),
        data: {
          key: form.key.trim(),
          name: form.name.trim(),
          stripePriceId: monthlyUsdAmount === 0 ? null : form.stripePriceId.trim(),
          monthlyUsdAmount,
          maxStreamDecks: form.maxStreamDecks ? Number(form.maxStreamDecks) : null,
          maxTeamMembers: form.maxTeamMembers ? Number(form.maxTeamMembers) : null,
          minIsvcConfidence: form.minIsvcConfidence || null,
          monthlyByteQuota: form.monthlyByteQuotaGb
            ? Math.round(Number(form.monthlyByteQuotaGb) * BYTES_PER_GB)
            : null,
          monthlyRequestQuota: form.monthlyRequestQuota ? Number(form.monthlyRequestQuota) : null,
          features: form.features,
          active: form.active,
        },
      }).unwrap();
      onDone();
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to save plan.'));
    }
  }

  return (
    <form
      className="grid gap-3 rounded-lg border border-line bg-surface-muted p-4"
      onSubmit={handleSave}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm font-bold">
          Plan key
          <input
            className={inputClass}
            disabled={!isNew}
            onChange={(e) => setForm({ ...form, key: e.target.value })}
            placeholder="starter"
            value={form.key}
          />
        </label>
        <label className="grid gap-1 text-sm font-bold">
          Display name
          <input
            className={inputClass}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Starter"
            value={form.name}
          />
        </label>
        <label className="grid gap-1 text-sm font-bold sm:col-span-2">
          Stripe Price id {Number(form.monthlyUsdAmount) === 0 ? '(not used for free plans)' : ''}
          <input
            className={inputClass}
            disabled={Number(form.monthlyUsdAmount) === 0}
            onChange={(e) => setForm({ ...form, stripePriceId: e.target.value })}
            placeholder={
              Number(form.monthlyUsdAmount) === 0
                ? 'Free plan: no Stripe price'
                : 'price_1AbCdEfGhIjKlMn'
            }
            value={form.stripePriceId}
          />
        </label>
        <label className="grid gap-1 text-sm font-bold">
          Monthly USD amount
          <input
            className={inputClass}
            min="0"
            onChange={(e) => setForm({ ...form, monthlyUsdAmount: e.target.value })}
            step="0.01"
            type="number"
            value={form.monthlyUsdAmount}
          />
        </label>
        <label className="grid gap-1 text-sm font-bold">
          Max stream decks (blank = unlimited)
          <input
            className={inputClass}
            min="1"
            onChange={(e) => setForm({ ...form, maxStreamDecks: e.target.value })}
            type="number"
            value={form.maxStreamDecks}
          />
        </label>
        <label className="grid gap-1 text-sm font-bold">
          Max team members (blank = unlimited)
          <input
            className={inputClass}
            min="1"
            onChange={(e) => setForm({ ...form, maxTeamMembers: e.target.value })}
            type="number"
            value={form.maxTeamMembers}
          />
        </label>
        <label className="grid gap-1 text-sm font-bold">
          Minimum quality tier
          <select
            className={inputClass}
            onChange={(e) =>
              setForm({ ...form, minIsvcConfidence: e.target.value as IsvcConfidence | '' })
            }
            value={form.minIsvcConfidence}
          >
            {CONFIDENCE_TIER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-bold">
          Monthly data quota, GB (blank = unlimited)
          <input
            className={inputClass}
            min="0"
            onChange={(e) => setForm({ ...form, monthlyByteQuotaGb: e.target.value })}
            step="0.1"
            type="number"
            value={form.monthlyByteQuotaGb}
          />
        </label>
        <label className="grid gap-1 text-sm font-bold">
          Monthly request quota (blank = unlimited)
          <input
            className={inputClass}
            min="1"
            onChange={(e) => setForm({ ...form, monthlyRequestQuota: e.target.value })}
            type="number"
            value={form.monthlyRequestQuota}
          />
        </label>
        <FeatureListEditor
          features={form.features}
          onChange={(features) => setForm({ ...form, features })}
        />
        <label className="flex items-center gap-2 text-sm font-bold">
          <input
            checked={form.active}
            onChange={(e) => setForm({ ...form, active: e.target.checked })}
            type="checkbox"
          />
          Active (selectable by subscribers)
        </label>
      </div>

      {error && (
        <p className="text-sm leading-relaxed text-danger" role="alert">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <ActionButton
          className={primaryButtonClass}
          pending={isSaving}
          pendingLabel="Saving"
          type="submit"
        >
          {isNew ? 'Add plan' : 'Save changes'}
        </ActionButton>
        <button
          className="inline-flex min-h-10 items-center justify-center rounded-lg border border-line bg-white px-3.5 py-2.5 font-bold text-ink transition-colors hover:bg-surface-muted"
          onClick={onDone}
          type="button"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function PlanRow({ plan }: { plan: SubscriptionPlan }) {
  const [editing, setEditing] = useState(false);
  const [deletePlan, { isLoading: isDeleting }] = useDeleteSubscriptionPlanMutation();
  const [error, setError] = useState<string | null>(null);

  if (editing) {
    return <PlanForm initial={planToForm(plan)} isNew={false} onDone={() => setEditing(false)} />;
  }

  async function handleDelete() {
    setError(null);
    try {
      await deletePlan(plan.key).unwrap();
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to delete plan.'));
    }
  }

  return (
    <div className="grid gap-2 rounded-lg border border-line bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-bold">
            {plan.name}{' '}
            <span className="font-normal text-muted">
              (key: {plan.key}) -- ${plan.monthlyUsdAmount}/mo
            </span>
          </p>
          <p className="mt-1 text-sm text-muted">
            {Number(plan.monthlyUsdAmount) === 0
              ? 'Free plan - no Stripe billing'
              : `Stripe Price: ${plan.stripePriceId}`}
          </p>
          <p className="mt-1 text-sm text-muted">
            Stream decks: {plan.maxStreamDecks ?? 'unlimited'} -- Team members:{' '}
            {plan.maxTeamMembers ?? 'unlimited'}
          </p>
          <p className="mt-1 text-sm text-muted">
            Quality tier:{' '}
            {plan.minIsvcConfidence
              ? plan.minIsvcConfidence.replace('_', ' ') + ' or higher'
              : 'Full catalogue access'}
          </p>
          <p className="mt-1 text-sm text-muted">
            Monthly quota:{' '}
            {plan.monthlyByteQuota
              ? `${(Number(plan.monthlyByteQuota) / BYTES_PER_GB).toFixed(1)} GB`
              : 'unlimited data'}
            {' -- '}
            {plan.monthlyRequestQuota
              ? `${plan.monthlyRequestQuota.toLocaleString()} requests`
              : 'unlimited requests'}
          </p>
          {plan.features.length > 0 && (
            <ul className="mt-2 grid gap-1">
              {plan.features.map((feature, index) => (
                <li
                  className="flex items-start gap-1.5 text-sm text-ink"
                  key={`${feature}-${index}`}
                >
                  <Check className="mt-0.5 size-3.5 shrink-0 text-accent" aria-hidden="true" />
                  {feature}
                </li>
              ))}
            </ul>
          )}
        </div>
        <span
          className={`shrink-0 rounded-full px-3 py-1 text-sm font-bold ${
            plan.active ? 'bg-accent/10 text-accent-dark' : 'bg-danger/10 text-danger'
          }`}
        >
          {plan.active ? 'Active' : 'Inactive'}
        </span>
      </div>
      {error && (
        <p className="text-sm leading-relaxed text-danger" role="alert">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          className="inline-flex min-h-10 items-center justify-center rounded-lg border border-line bg-white px-3.5 py-2.5 font-bold text-ink transition-colors hover:bg-surface-muted"
          onClick={() => setEditing(true)}
          type="button"
        >
          Edit
        </button>
        <ActionButton
          className={dangerButtonClass}
          onClick={handleDelete}
          pending={isDeleting}
          pendingLabel="Deleting"
          type="button"
        >
          Delete
        </ActionButton>
      </div>
    </div>
  );
}

/**
 * Trainer-payout Stripe rail (Stripe Connect Express) -- distinct from the
 * subscriber-billing Stripe integration this tab otherwise covers (Checkout
 * sessions/Customers for Voice Stream subscriptions, configured via the
 * "Stripe Keys" section below). Same STRIPE_SECRET_KEY, different Stripe API
 * surface (Connect accounts + transfers instead of Checkout), so it gets its
 * own gate rather than reusing isFlutterwavePayoutsEnabled or being folded
 * into the subscription-billing keys above.
 */
function StripePayoutsSettingsPanel() {
  const { data: settings, isLoading } = useGetPlatformSettingsQuery();
  const [updateSettings, { isLoading: isSaving }] = useUpdatePlatformSettingsMutation();

  const [payoutsEnabled, setPayoutsEnabled] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!settings) return;
    setPayoutsEnabled(settings.isStripePayoutsEnabled);
  }, [settings]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setError(null);
    try {
      await updateSettings({ isStripePayoutsEnabled: payoutsEnabled }).unwrap();
      setMessage('Stripe payout settings saved.');
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to save Stripe payout settings.'));
    }
  }

  return (
    <section className="grid gap-4 rounded-lg border border-line bg-white p-5 shadow-[0_2px_8px_rgba(27,31,27,0.05)]">
      <div className="grid gap-1">
        <h2 className="text-2xl leading-snug">Stripe Connect (Trainer Payouts)</h2>
        <p className="leading-relaxed text-muted">
          Controls the Stripe Connect Express payout rail -- an alternative to Flutterwave for
          trainers who prefer Stripe. Trainers complete onboarding (identity + bank account) on
          Stripe's own hosted pages; we never see raw bank details for this rail. Uses the same
          Stripe Secret Key configured below, plus the separate{' '}
          <code className="rounded bg-surface-muted px-1 py-0.5 text-sm">
            STRIPE_CONNECT_WEBHOOK_SECRET
          </code>{' '}
          environment variable for webhook verification.
        </p>
      </div>

      {isLoading && <p className="text-muted">Loading...</p>}
      {!isLoading && (
        <form className="grid gap-4 md:max-w-lg" onSubmit={handleSave}>
          <div>
            <label
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-surface-muted p-4"
              htmlFor="stripe-payouts-enabled"
            >
              <input
                checked={payoutsEnabled}
                className="mt-0.5 size-5 accent-accent"
                id="stripe-payouts-enabled"
                onChange={(event) => setPayoutsEnabled(event.target.checked)}
                type="checkbox"
              />
              <span>
                <span className="block font-bold">Stripe Connect payouts enabled</span>
                <span className="mt-1 block text-sm leading-relaxed text-muted">
                  When off, trainers cannot create a Stripe payout account and admins cannot submit
                  withdrawals to Stripe -- keep this off until STRIPE_SECRET_KEY and
                  STRIPE_CONNECT_WEBHOOK_SECRET are configured and tested.
                </span>
              </span>
            </label>
          </div>

          <div>
            <ActionButton
              className={primaryButtonClass}
              pending={isSaving}
              pendingLabel="Saving"
              type="submit"
            >
              Save Stripe payout settings
            </ActionButton>
          </div>
        </form>
      )}

      {message && <p className="leading-relaxed text-accent-dark">{message}</p>}
      {error && (
        <p className="leading-relaxed text-danger" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

export function StripeSubscriptionsSettingsPanel() {
  const { data: tokens, isLoading: tokensLoading } = useGetApiAccessTokensQuery();
  const { data: plans, isLoading: plansLoading } = useGetSubscriptionPlansQuery();
  const [addingPlan, setAddingPlan] = useState(false);

  const stripeTokens = tokens?.filter((t) => STRIPE_KEYS.includes(t.key)) ?? [];

  return (
    <div className="grid gap-6">
      <StripePayoutsSettingsPanel />

      <section className="grid gap-4 rounded-lg border border-line bg-white p-5 shadow-[0_2px_8px_rgba(27,31,27,0.05)]">
        <div className="grid gap-1">
          <h2 className="text-2xl leading-snug">Stripe Keys</h2>
          <p className="leading-relaxed text-muted">
            Credentials for the Voice Stream Stripe integration. Encrypted at rest and never shown
            again after saving.
          </p>
        </div>
        {tokensLoading && <p className="text-muted">Loading...</p>}
        {!tokensLoading && (
          <div className="grid gap-4">
            {stripeTokens.map((token) => (
              <StripeKeyRow key={token.key} token={token} />
            ))}
          </div>
        )}
      </section>

      <section className="grid gap-4 rounded-lg border border-line bg-white p-5 shadow-[0_2px_8px_rgba(27,31,27,0.05)]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="grid gap-1">
            <h2 className="text-2xl leading-snug">Subscription Plans</h2>
            <p className="leading-relaxed text-muted">
              Voice Stream subscription tiers and their Stripe Price ids. These are read directly
              from this table when creating a Checkout session -- no env var or redeploy needed to
              change a price.
            </p>
          </div>
          {!addingPlan && (
            <button
              className={primaryButtonClass}
              onClick={() => setAddingPlan(true)}
              type="button"
            >
              Add plan
            </button>
          )}
        </div>

        {addingPlan && (
          <PlanForm initial={emptyPlanForm()} isNew onDone={() => setAddingPlan(false)} />
        )}

        {plansLoading && <p className="text-muted">Loading...</p>}
        {!plansLoading && (
          <div className="grid gap-3">
            {plans?.map((plan) => (
              <PlanRow key={plan.key} plan={plan} />
            ))}
            {plans?.length === 0 && !addingPlan && (
              <p className="text-muted">No subscription plans configured yet.</p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

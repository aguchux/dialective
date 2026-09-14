'use client';

import { FormEvent, useState } from 'react';
import { ChevronDown, ChevronUp, Plus, Trash2, Webhook } from 'lucide-react';
import {
  CreatedWebhookSubscription,
  WebhookEventType,
  WebhookSubscriptionSummary,
  useCreateWebhookMutation,
  useDeleteWebhookMutation,
  useListWebhookDeliveriesQuery,
  useListWebhooksQuery,
} from '@/store/api';
import { Skeleton } from '../primitives';
import {
  SettingsCard,
  SettingsErrorText,
  SettingsField,
  SettingsPrimaryButton,
  SettingsSecondaryButton,
  settingsInputClassName,
} from './SettingsCard';

const ALL_EVENT_TYPES: { value: WebhookEventType; label: string }[] = [
  { value: 'SUBSCRIBER_CREATED', label: 'Subscriber created' },
  { value: 'SUBSCRIPTION_ACTIVATED', label: 'Subscription activated' },
  { value: 'SUBSCRIPTION_PAYMENT_FAILED', label: 'Subscription payment failed' },
  { value: 'DECK_CREATED', label: 'Stream Deck created' },
  { value: 'DECK_ITEM_ADDED', label: 'Recording added to deck' },
  { value: 'DECK_ITEM_REMOVED', label: 'Recording removed from deck' },
  { value: 'DECK_VERSION_CREATED', label: 'Deck version created' },
  { value: 'VALIDATION_SUBMITTED', label: 'Validation submitted' },
  { value: 'ISVC_VERSION_CREATED', label: 'ISVC version created' },
  { value: 'API_KEY_CREATED', label: 'API key created' },
  { value: 'API_KEY_REVOKED', label: 'API key revoked' },
  { value: 'AUDIO_STREAM_COMPLETED', label: 'Audio stream completed' },
  { value: 'AUDIO_STREAM_DENIED', label: 'Audio stream denied' },
];

function RevealedSecretBanner({
  created,
  onDismiss,
}: {
  created: CreatedWebhookSubscription;
  onDismiss: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(created.plaintextSecret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="rounded-lg border border-catalogue-blue/40 bg-catalogue-blue/10 p-4">
      <p className="mb-2 text-sm font-bold text-catalogue-blue-bright">
        Copy this signing secret now -- it will not be shown again.
      </p>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 break-all rounded-lg border border-catalogue-line bg-catalogue-bg px-3 py-2 text-sm text-catalogue-ink">
          {created.plaintextSecret}
        </code>
        <SettingsPrimaryButton onClick={() => void copy()}>{copied ? 'Copied' : 'Copy'}</SettingsPrimaryButton>
        <SettingsSecondaryButton onClick={onDismiss}>Done</SettingsSecondaryButton>
      </div>
      <p className="text-xs text-catalogue-dim">
        Each delivery is signed with{' '}
        <code className="rounded bg-catalogue-bg px-1 py-0.5">X-Dialectiva-Signature: sha256=...</code> -- an
        HMAC-SHA256 of the raw JSON body, keyed by this secret.
      </p>
    </div>
  );
}

function CreateWebhookForm({
  onCreated,
  onDone,
}: {
  onCreated: (webhook: CreatedWebhookSubscription) => void;
  onDone: () => void;
}) {
  const [createWebhook, { isLoading }] = useCreateWebhookMutation();
  const [url, setUrl] = useState('');
  const [eventTypes, setEventTypes] = useState<WebhookEventType[]>([]);
  const [error, setError] = useState<string | null>(null);

  function toggleEvent(eventType: WebhookEventType) {
    setEventTypes((current) =>
      current.includes(eventType) ? current.filter((e) => e !== eventType) : [...current, eventType],
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (eventTypes.length === 0) {
      setError('Select at least one event.');
      return;
    }
    try {
      const result = await createWebhook({ url, eventTypes }).unwrap();
      onCreated(result);
    } catch (err: any) {
      setError(err?.data?.message ?? 'Unable to create this webhook.');
    }
  }

  return (
    <form className="grid gap-3 rounded-lg border border-catalogue-line bg-catalogue-bg p-4" onSubmit={submit}>
      <SettingsField label="Endpoint URL">
        <input
          className={settingsInputClassName}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://your-app.example.com/webhooks/dialectiva"
          required
          type="url"
          value={url}
        />
      </SettingsField>
      <SettingsField label="Events">
        <div className="grid gap-1.5 sm:grid-cols-2">
          {ALL_EVENT_TYPES.map((event) => (
            <label className="flex items-center gap-2 text-sm text-catalogue-ink" key={event.value}>
              <input checked={eventTypes.includes(event.value)} onChange={() => toggleEvent(event.value)} type="checkbox" />
              {event.label}
            </label>
          ))}
        </div>
      </SettingsField>
      {error && <SettingsErrorText>{error}</SettingsErrorText>}
      <div className="flex gap-2">
        <SettingsPrimaryButton disabled={isLoading} type="submit">
          {isLoading ? 'Creating...' : 'Create webhook'}
        </SettingsPrimaryButton>
        <SettingsSecondaryButton onClick={onDone}>Cancel</SettingsSecondaryButton>
      </div>
    </form>
  );
}

function DeliveryHistory({ webhookId }: { webhookId: string }) {
  const { data: deliveries, isLoading } = useListWebhookDeliveriesQuery(webhookId);

  if (isLoading) return <p className="p-3 text-xs text-catalogue-muted">Loading deliveries...</p>;
  if (!deliveries || deliveries.length === 0) {
    return <p className="p-3 text-xs text-catalogue-muted">No deliveries yet.</p>;
  }

  return (
    <div className="mt-2 divide-y divide-catalogue-line border-t border-catalogue-line">
      {deliveries.map((delivery) => (
        <div className="flex items-center justify-between gap-3 py-2" key={delivery.id}>
          <div>
            <p className="text-xs font-bold text-catalogue-ink">{delivery.eventType}</p>
            <p className="text-[11px] text-catalogue-dim">
              Attempt {delivery.attemptNumber} -- {new Date(delivery.createdAt).toLocaleString()}
            </p>
          </div>
          <span
            className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${
              delivery.succeeded ? 'bg-catalogue-green/15 text-catalogue-green' : 'bg-danger/15 text-danger'
            }`}
          >
            {delivery.succeeded ? `${delivery.resultCode ?? 'OK'}` : delivery.errorMessage ?? 'Failed'}
          </span>
        </div>
      ))}
    </div>
  );
}

function WebhookRow({ webhook }: { webhook: WebhookSubscriptionSummary }) {
  const [deleteWebhook, { isLoading: isDeleting }] = useDeleteWebhookMutation();
  const [error, setError] = useState<string | null>(null);
  const [showDeliveries, setShowDeliveries] = useState(false);

  async function handleDelete() {
    setError(null);
    try {
      await deleteWebhook(webhook.id).unwrap();
    } catch (err: any) {
      setError(err?.data?.message ?? 'Unable to delete this webhook.');
    }
  }

  return (
    <div className="rounded-lg border border-catalogue-line bg-catalogue-bg p-3.5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Webhook aria-hidden="true" className="size-4 text-catalogue-dim" />
            <code className="truncate text-sm font-bold text-catalogue-ink">{webhook.url}</code>
          </div>
          <p className="mt-1 text-xs text-catalogue-muted">{webhook.eventTypes.join(', ')}</p>
          <p className="mt-1 text-xs text-catalogue-dim">Created {new Date(webhook.createdAt).toLocaleDateString()}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${
              webhook.active ? 'bg-catalogue-green/15 text-catalogue-green' : 'bg-danger/15 text-danger'
            }`}
          >
            {webhook.active ? 'Active' : 'Inactive'}
          </span>
          <SettingsSecondaryButton onClick={() => setShowDeliveries((s) => !s)}>
            {showDeliveries ? <ChevronUp aria-hidden="true" className="size-3.5" /> : <ChevronDown aria-hidden="true" className="size-3.5" />}
          </SettingsSecondaryButton>
          <SettingsSecondaryButton disabled={isDeleting} onClick={() => void handleDelete()}>
            <Trash2 aria-hidden="true" className="size-3.5" />
          </SettingsSecondaryButton>
        </div>
      </div>
      {error && (
        <div className="mt-2">
          <SettingsErrorText>{error}</SettingsErrorText>
        </div>
      )}
      {showDeliveries && <DeliveryHistory webhookId={webhook.id} />}
    </div>
  );
}

export function WebhooksSection() {
  const { data: webhooks, isLoading } = useListWebhooksQuery();
  const [showForm, setShowForm] = useState(false);
  const [created, setCreated] = useState<CreatedWebhookSubscription | null>(null);

  return (
    <SettingsCard description="HTTP callbacks for Voice Stream events." title="Webhooks">
      <div className="flex items-center justify-end gap-3">
        {!showForm && (
          <SettingsPrimaryButton onClick={() => setShowForm(true)}>
            <Plus aria-hidden="true" className="size-4" />
            New webhook
          </SettingsPrimaryButton>
        )}
      </div>

      {created && <RevealedSecretBanner created={created} onDismiss={() => setCreated(null)} />}

      {showForm && (
        <CreateWebhookForm
          onCreated={(webhook) => {
            setCreated(webhook);
            setShowForm(false);
          }}
          onDone={() => setShowForm(false)}
        />
      )}

      {isLoading ? (
        <Skeleton className="h-16 w-full" />
      ) : webhooks && webhooks.length > 0 ? (
        <div className="grid gap-2.5">
          {webhooks.map((webhook) => (
            <WebhookRow key={webhook.id} webhook={webhook} />
          ))}
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-catalogue-line-strong p-4 text-center text-sm text-catalogue-muted">
          No webhooks yet.
        </p>
      )}
    </SettingsCard>
  );
}

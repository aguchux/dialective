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
import {
  Card,
  ErrorText,
  FieldLabel,
  PageHeading,
  PrimaryButton,
  SecondaryButton,
  TextInput,
} from '@/components/ui';

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
    <Card className="mb-6 border-accent bg-accent-soft p-5">
      <p className="mb-2 text-sm font-bold text-accent-dark">
        Copy this signing secret now -- it will not be shown again.
      </p>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 break-all rounded-lg border border-line bg-white px-3 py-2.5 text-sm">
          {created.plaintextSecret}
        </code>
        <PrimaryButton onClick={copy} type="button">
          {copied ? 'Copied' : 'Copy'}
        </PrimaryButton>
        <SecondaryButton onClick={onDismiss} type="button">
          Done
        </SecondaryButton>
      </div>
      <p className="text-xs text-muted">
        Each delivery is signed with{' '}
        <code className="rounded bg-white px-1 py-0.5">X-Dialectiva-Signature: sha256=...</code> --
        an HMAC-SHA256 of the raw JSON body, keyed by this secret. Verify it before trusting a
        payload.
      </p>
    </Card>
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
      current.includes(eventType)
        ? current.filter((e) => e !== eventType)
        : [...current, eventType],
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
    <Card className="mb-6 p-5">
      <form className="grid gap-4" onSubmit={submit}>
        <div>
          <FieldLabel>Endpoint URL</FieldLabel>
          <TextInput
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://your-app.example.com/webhooks/dialectiva"
            required
            type="url"
            value={url}
          />
        </div>

        <div>
          <FieldLabel>Events</FieldLabel>
          <div className="grid gap-2 sm:grid-cols-2">
            {ALL_EVENT_TYPES.map((event) => (
              <label className="flex items-center gap-2 text-sm text-ink" key={event.value}>
                <input
                  checked={eventTypes.includes(event.value)}
                  onChange={() => toggleEvent(event.value)}
                  type="checkbox"
                />
                {event.label}
              </label>
            ))}
          </div>
        </div>

        {error && <ErrorText>{error}</ErrorText>}

        <div className="flex gap-2">
          <PrimaryButton disabled={isLoading} type="submit">
            {isLoading ? 'Creating...' : 'Create webhook'}
          </PrimaryButton>
          <SecondaryButton onClick={onDone} type="button">
            Cancel
          </SecondaryButton>
        </div>
      </form>
    </Card>
  );
}

function DeliveryHistory({ webhookId }: { webhookId: string }) {
  const { data: deliveries, isLoading } = useListWebhookDeliveriesQuery(webhookId);

  if (isLoading) return <p className="p-4 text-sm text-muted">Loading deliveries...</p>;
  if (!deliveries || deliveries.length === 0) {
    return <p className="p-4 text-sm text-muted">No deliveries yet.</p>;
  }

  return (
    <div className="divide-y divide-line border-t border-line">
      {deliveries.map((delivery) => (
        <div className="flex items-center justify-between gap-3 p-3" key={delivery.id}>
          <div>
            <p className="text-sm font-bold text-ink">{delivery.eventType}</p>
            <p className="text-xs text-muted">
              Attempt {delivery.attemptNumber} -- {new Date(delivery.createdAt).toLocaleString()}
            </p>
          </div>
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-bold ${
              delivery.succeeded ? 'bg-accent/10 text-accent-dark' : 'bg-danger/10 text-danger'
            }`}
          >
            {delivery.succeeded
              ? `${delivery.resultCode ?? 'OK'}`
              : (delivery.errorMessage ?? 'Failed')}
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
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Webhook aria-hidden="true" className="size-4 text-muted" />
            <code className="truncate text-sm font-bold text-ink">{webhook.url}</code>
          </div>
          <p className="mt-1 text-xs text-muted">{webhook.eventTypes.join(', ')}</p>
          <p className="mt-1 text-xs text-muted">
            Created {new Date(webhook.createdAt).toLocaleDateString()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-bold ${
              webhook.active ? 'bg-accent/10 text-accent-dark' : 'bg-danger/10 text-danger'
            }`}
          >
            {webhook.active ? 'Active' : 'Inactive'}
          </span>
          <SecondaryButton onClick={() => setShowDeliveries((s) => !s)} type="button">
            {showDeliveries ? (
              <ChevronUp aria-hidden="true" className="size-3.5" />
            ) : (
              <ChevronDown aria-hidden="true" className="size-3.5" />
            )}
            Deliveries
          </SecondaryButton>
          <SecondaryButton disabled={isDeleting} onClick={handleDelete} type="button">
            <Trash2 aria-hidden="true" className="size-3.5" />
            Delete
          </SecondaryButton>
        </div>
      </div>
      {error && <div className="mt-2">{<ErrorText>{error}</ErrorText>}</div>}
      {showDeliveries && <DeliveryHistory webhookId={webhook.id} />}
    </Card>
  );
}

export default function WebhooksPage() {
  const { data: webhooks, isLoading } = useListWebhooksQuery();
  const [showForm, setShowForm] = useState(false);
  const [created, setCreated] = useState<CreatedWebhookSubscription | null>(null);

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <PageHeading
          subtitle="HTTP callbacks for Voice Stream events -- deck changes, billing events, key revocations, and more."
          title="Webhooks"
        />
        {!showForm && (
          <PrimaryButton onClick={() => setShowForm(true)} type="button">
            <Plus aria-hidden="true" className="size-4" />
            New webhook
          </PrimaryButton>
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
        <p className="text-sm text-muted">Loading...</p>
      ) : webhooks && webhooks.length > 0 ? (
        <div className="grid gap-3">
          {webhooks.map((webhook) => (
            <WebhookRow key={webhook.id} webhook={webhook} />
          ))}
        </div>
      ) : (
        <Card className="p-8 text-center text-sm text-muted">
          No webhooks yet. Create one to have Voice Stream notify your systems in real time.
        </Card>
      )}
    </div>
  );
}

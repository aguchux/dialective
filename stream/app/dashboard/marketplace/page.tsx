'use client';

import { FormEvent, useState } from 'react';
import { useSession } from 'next-auth/react';
import { CheckCircle2, ClipboardList, Copy, ShieldCheck, Store } from 'lucide-react';
import {
  PublicDeckSummary,
  QualityTier,
  useAcceptPublicDeckLicenseMutation,
  useCopyPublicDeckToMineMutation,
  useImportPublicDeckToValidationQueueMutation,
  useListPublicDecksQuery,
} from '@/store/api';
import type { SubscriberOrgRole } from '@/lib/api-client';
import {
  Card,
  ErrorText,
  FieldLabel,
  PageHeading,
  PrimaryButton,
  SecondaryButton,
  TextInput,
} from '@/components/ui';

const CAN_MANAGE_DECKS: SubscriberOrgRole[] = ['OWNER', 'ADMIN', 'DATASET_MANAGER'];
const CAN_VALIDATE: SubscriberOrgRole[] = ['OWNER', 'ADMIN', 'DATASET_MANAGER', 'VALIDATOR'];

const TIER_LABELS: Record<QualityTier, { label: string; className: string }> = {
  standard: { label: 'Standard', className: 'bg-surface-muted text-muted' },
  high: { label: 'High confidence', className: 'bg-accent/10 text-accent-dark' },
  premium_verified: { label: 'Premium verified', className: 'bg-emerald-50 text-emerald-700' },
};

function DeckCard({
  deck,
  canManageDecks,
  canValidate,
}: {
  deck: PublicDeckSummary;
  canManageDecks: boolean;
  canValidate: boolean;
}) {
  const [acceptLicense, { isLoading: accepting }] = useAcceptPublicDeckLicenseMutation();
  const [copyToMine, { isLoading: copying }] = useCopyPublicDeckToMineMutation();
  const [importToQueue, { isLoading: importing }] = useImportPublicDeckToValidationQueueMutation();
  const [showCopyForm, setShowCopyForm] = useState(false);
  const [newDeckName, setNewDeckName] = useState(deck.name);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const needsAcceptance = deck.hasLicense && !deck.licenseAccepted;

  async function handleAccept() {
    setError(null);
    try {
      await acceptLicense(deck.id).unwrap();
    } catch (err: any) {
      setError(err?.data?.message ?? 'Unable to accept this license.');
    }
  }

  async function handleCopy(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    try {
      await copyToMine({ id: deck.id, newDeckName }).unwrap();
      setMessage(`Copied into a new deck: "${newDeckName}".`);
      setShowCopyForm(false);
    } catch (err: any) {
      setError(err?.data?.message ?? 'Unable to copy this deck.');
    }
  }

  async function handleImportToQueue() {
    setError(null);
    setMessage(null);
    try {
      const result = await importToQueue(deck.id).unwrap();
      setMessage(
        `Queued ${result.queued} recording${result.queued === 1 ? '' : 's'} for your validators.`,
      );
    } catch (err: any) {
      setError(err?.data?.message ?? 'Unable to queue this deck for validation.');
    }
  }

  const tier = TIER_LABELS[deck.minQualityTier];

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-bold text-ink">{deck.name}</p>
          <p className="text-xs text-muted">{deck.organizationName}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${tier.className}`}>
          {tier.label}
        </span>
      </div>
      <p className="mt-2 text-sm text-muted">{deck.itemCount} recordings</p>

      {deck.hasLicense && deck.license && (
        <div className="mt-3 rounded-lg border border-line bg-surface-muted p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-muted">License</p>
          <p className="mt-1 text-sm text-ink">{deck.license.termsSummary}</p>
          <p className="mt-1 text-xs text-muted">
            {deck.license.attributionRequired ? 'Attribution required' : 'No attribution required'}{' '}
            ·{' '}
            {deck.license.redistributionAllowed
              ? 'Redistribution allowed'
              : 'Redistribution not allowed'}
          </p>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {needsAcceptance ? (
          <PrimaryButton disabled={accepting} onClick={() => void handleAccept()} type="button">
            <ShieldCheck aria-hidden="true" className="size-4" />
            {accepting ? 'Accepting...' : 'Accept license to continue'}
          </PrimaryButton>
        ) : (
          <>
            {canManageDecks && (
              <SecondaryButton onClick={() => setShowCopyForm((s) => !s)} type="button">
                <Copy aria-hidden="true" className="size-3.5" />
                Copy to my decks
              </SecondaryButton>
            )}
            {canValidate && (
              <SecondaryButton
                disabled={importing}
                onClick={() => void handleImportToQueue()}
                type="button"
              >
                <ClipboardList aria-hidden="true" className="size-3.5" />
                {importing ? 'Queuing...' : 'Queue for validation'}
              </SecondaryButton>
            )}
            {deck.hasLicense && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                <CheckCircle2 aria-hidden="true" className="size-3.5" />
                License accepted
              </span>
            )}
          </>
        )}
      </div>

      {showCopyForm && !needsAcceptance && (
        <form
          className="mt-3 flex flex-wrap items-end gap-2 border-t border-line pt-3"
          onSubmit={handleCopy}
        >
          <div className="flex-1">
            <FieldLabel>New deck name</FieldLabel>
            <TextInput
              onChange={(e) => setNewDeckName(e.target.value)}
              required
              value={newDeckName}
            />
          </div>
          <PrimaryButton disabled={copying} type="submit">
            {copying ? 'Copying...' : 'Copy'}
          </PrimaryButton>
        </form>
      )}

      {message && <p className="mt-3 text-sm font-semibold text-accent-dark">{message}</p>}
      {error && <div className="mt-3">{<ErrorText>{error}</ErrorText>}</div>}
    </Card>
  );
}

export default function DataMarketplacePage() {
  const { data: session } = useSession();
  const canManageDecks = session?.user.orgRole
    ? CAN_MANAGE_DECKS.includes(session.user.orgRole)
    : false;
  const canValidate = session?.user.orgRole ? CAN_VALIDATE.includes(session.user.orgRole) : false;

  const [minQualityTier, setMinQualityTier] = useState<QualityTier | ''>('');
  const { data: decks, isLoading } = useListPublicDecksQuery(
    minQualityTier ? { minQualityTier } : undefined,
  );

  return (
    <div>
      <PageHeading
        subtitle="Public Stream Decks published by other subscriber organizations. Copy recordings into your own deck, or queue them for your own validators -- you can never stream directly from another organization's deck."
        title="Data Marketplace"
      />

      <div className="mb-6 flex items-center gap-3">
        <FieldLabel>Minimum quality</FieldLabel>
        <select
          className="min-h-10 rounded-lg border border-line bg-white px-3 text-sm"
          onChange={(e) => setMinQualityTier(e.target.value as QualityTier | '')}
          value={minQualityTier}
        >
          <option value="">Any</option>
          <option value="high">High confidence</option>
          <option value="premium_verified">Premium verified</option>
        </select>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted">Loading...</p>
      ) : decks && decks.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {decks.map((deck) => (
            <DeckCard
              canManageDecks={canManageDecks}
              canValidate={canValidate}
              deck={deck}
              key={deck.id}
            />
          ))}
        </div>
      ) : (
        <Card className="p-8 text-center">
          <Store aria-hidden="true" className="mx-auto mb-3 size-8 text-muted" />
          <p className="text-sm text-muted">
            No public decks match this filter yet. Check back later, or publish one of your own
            decks from Stream Decks.
          </p>
        </Card>
      )}
    </div>
  );
}

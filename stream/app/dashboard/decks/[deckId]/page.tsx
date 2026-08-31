'use client';

import { FormEvent, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Globe, History, Lock, Sparkles, Trash2 } from 'lucide-react';
import {
  IsvcConfidence,
  StreamDeck,
  StreamDeckRule,
  useDeleteStreamDeckMutation,
  useGetStreamDeckQuery,
  useListStreamDeckVersionsQuery,
  useRemoveStreamDeckItemMutation,
  useRemoveStreamDeckLicenseMutation,
  useSetStreamDeckLicenseMutation,
  useSetStreamDeckVisibilityMutation,
  useUpdateStreamDeckRuleMutation,
} from '@/store/api';
import { Card, ErrorText, FieldLabel, PageHeading, PrimaryButton, SecondaryButton, TextInput } from '@/components/ui';

const CONFIDENCE_OPTIONS: IsvcConfidence[] = ['EMERGING', 'ESTABLISHED', 'HIGH', 'VERY_HIGH'];

const REASON_LABELS: Record<string, string> = {
  manual_add: 'Recording added',
  manual_remove: 'Recording removed',
  smart_rule_match: 'Smart Deck rule matched',
  eligibility_purge: 'Recording became ineligible',
};

function RuleEditor({ deckId, rule }: { deckId: string; rule: StreamDeckRule | null | undefined }) {
  const [updateRule, { isLoading }] = useUpdateStreamDeckRuleMutation();
  const [countryCode, setCountryCode] = useState(rule?.countryCode ?? '');
  const [dialectTag, setDialectTag] = useState(rule?.dialectTag ?? '');
  const [subdialectTag, setSubdialectTag] = useState(rule?.subdialectTag ?? '');
  const [minScore, setMinScore] = useState(rule?.minScore?.toString() ?? '');
  const [minIsvs, setMinIsvs] = useState(rule?.minIsvs?.toString() ?? '');
  const [minConfidence, setMinConfidence] = useState(rule?.minConfidence ?? '');
  const [minOrganizationCount, setMinOrganizationCount] = useState(
    rule?.minOrganizationCount?.toString() ?? '',
  );
  const [minAudioQuality, setMinAudioQuality] = useState(rule?.minAudioQuality?.toString() ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    try {
      await updateRule({
        id: deckId,
        rule: {
          countryCode: countryCode || undefined,
          dialectTag: dialectTag || undefined,
          subdialectTag: subdialectTag || undefined,
          minScore: minScore ? Number(minScore) : undefined,
          minIsvs: minIsvs ? Number(minIsvs) : undefined,
          minConfidence: (minConfidence || undefined) as IsvcConfidence | undefined,
          minOrganizationCount: minOrganizationCount ? Number(minOrganizationCount) : undefined,
          minAudioQuality: minAudioQuality ? Number(minAudioQuality) : undefined,
        },
      }).unwrap();
      setSaved(true);
    } catch (err: any) {
      setError(err?.data?.message ?? 'Unable to update this rule.');
    }
  }

  return (
    <Card className="mb-6 p-5">
      <div className="mb-3 flex items-center gap-2">
        <Sparkles aria-hidden="true" className="size-4 text-accent" />
        <p className="font-bold text-ink">Smart Deck rule</p>
      </div>
      <form className="grid gap-3" onSubmit={submit}>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <FieldLabel>Country</FieldLabel>
            <TextInput onChange={(e) => setCountryCode(e.target.value)} value={countryCode} />
          </div>
          <div>
            <FieldLabel>Dialect</FieldLabel>
            <TextInput onChange={(e) => setDialectTag(e.target.value)} value={dialectTag} />
          </div>
          <div>
            <FieldLabel>Subdialect</FieldLabel>
            <TextInput onChange={(e) => setSubdialectTag(e.target.value)} value={subdialectTag} />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <FieldLabel>Min DL Canonical Score</FieldLabel>
            <TextInput max={100} min={0} onChange={(e) => setMinScore(e.target.value)} type="number" value={minScore} />
          </div>
          <div>
            <FieldLabel>Min ISVS</FieldLabel>
            <TextInput max={100} min={0} onChange={(e) => setMinIsvs(e.target.value)} type="number" value={minIsvs} />
          </div>
          <div>
            <FieldLabel>Min ISVC confidence</FieldLabel>
            <select
              className="min-h-10 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink outline-none focus:border-accent"
              onChange={(e) => setMinConfidence(e.target.value)}
              value={minConfidence}
            >
              <option value="">Any</option>
              {CONFIDENCE_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <FieldLabel>Min independent organizations</FieldLabel>
            <TextInput
              min={0}
              onChange={(e) => setMinOrganizationCount(e.target.value)}
              type="number"
              value={minOrganizationCount}
            />
          </div>
          <div>
            <FieldLabel>Min audio quality</FieldLabel>
            <TextInput
              max={100}
              min={0}
              onChange={(e) => setMinAudioQuality(e.target.value)}
              type="number"
              value={minAudioQuality}
            />
          </div>
        </div>
        {error && <ErrorText>{error}</ErrorText>}
        {saved && <p className="text-sm font-semibold text-accent-dark">Rule saved.</p>}
        <div>
          <PrimaryButton disabled={isLoading} type="submit">
            {isLoading ? 'Saving...' : 'Save rule'}
          </PrimaryButton>
        </div>
      </form>
    </Card>
  );
}

function SharingCard({ deck }: { deck: StreamDeck }) {
  const [setVisibility, { isLoading: togglingVisibility }] = useSetStreamDeckVisibilityMutation();
  const [setLicense, { isLoading: savingLicense }] = useSetStreamDeckLicenseMutation();
  const [removeLicense] = useRemoveStreamDeckLicenseMutation();
  const [editingLicense, setEditingLicense] = useState(false);
  const [termsSummary, setTermsSummary] = useState(deck.license?.termsSummary ?? '');
  const [attributionRequired, setAttributionRequired] = useState(deck.license?.attributionRequired ?? false);
  const [redistributionAllowed, setRedistributionAllowed] = useState(
    deck.license?.redistributionAllowed ?? false,
  );
  const [error, setError] = useState<string | null>(null);

  const isPublic = deck.visibility === 'PUBLIC';

  async function toggleVisibility() {
    setError(null);
    try {
      await setVisibility({ id: deck.id, visibility: isPublic ? 'PRIVATE' : 'PUBLIC' }).unwrap();
    } catch (err: any) {
      setError(err?.data?.message ?? 'Unable to update visibility.');
    }
  }

  async function saveLicense(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await setLicense({ id: deck.id, termsSummary, attributionRequired, redistributionAllowed }).unwrap();
      setEditingLicense(false);
    } catch (err: any) {
      setError(err?.data?.message ?? 'Unable to save this license.');
    }
  }

  return (
    <Card className="mb-6 p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          {isPublic ? (
            <Globe aria-hidden="true" className="mt-0.5 size-5 text-emerald-600" />
          ) : (
            <Lock aria-hidden="true" className="mt-0.5 size-5 text-muted" />
          )}
          <div>
            <p className="font-bold text-ink">{isPublic ? 'Public' : 'Private'}</p>
            <p className="text-xs text-muted">
              {isPublic
                ? 'Other organizations can find this deck and copy its recordings into their own deck, or queue them for their own validators. They can never stream directly from this deck.'
                : 'Only your organization can see this deck.'}
            </p>
          </div>
        </div>
        <SecondaryButton disabled={togglingVisibility} onClick={() => void toggleVisibility()} type="button">
          {isPublic ? 'Make private' : 'Make public'}
        </SecondaryButton>
      </div>

      {isPublic && (
        <div className="mt-4 border-t border-line pt-4">
          {!editingLicense && deck.license && (
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-muted">License terms</p>
                <p className="mt-1 text-sm text-ink">{deck.license.termsSummary}</p>
                <p className="mt-1 text-xs text-muted">
                  {deck.license.attributionRequired ? 'Attribution required' : 'No attribution required'} ·{' '}
                  {deck.license.redistributionAllowed ? 'Redistribution allowed' : 'Redistribution not allowed'}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <SecondaryButton onClick={() => setEditingLicense(true)} type="button">
                  Edit
                </SecondaryButton>
                <SecondaryButton onClick={() => void removeLicense(deck.id)} type="button">
                  Remove
                </SecondaryButton>
              </div>
            </div>
          )}
          {!editingLicense && !deck.license && (
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm text-muted">
                No license attached -- other organizations can copy from this deck freely.
              </p>
              <SecondaryButton onClick={() => setEditingLicense(true)} type="button">
                Add a license
              </SecondaryButton>
            </div>
          )}
          {editingLicense && (
            <form className="grid gap-3" onSubmit={saveLicense}>
              <div>
                <FieldLabel>Terms summary</FieldLabel>
                <textarea
                  className="min-h-24 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-accent"
                  onChange={(e) => setTermsSummary(e.target.value)}
                  required
                  value={termsSummary}
                />
              </div>
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-sm text-ink">
                  <input
                    checked={attributionRequired}
                    onChange={(e) => setAttributionRequired(e.target.checked)}
                    type="checkbox"
                  />
                  Attribution required
                </label>
                <label className="flex items-center gap-2 text-sm text-ink">
                  <input
                    checked={redistributionAllowed}
                    onChange={(e) => setRedistributionAllowed(e.target.checked)}
                    type="checkbox"
                  />
                  Redistribution allowed
                </label>
              </div>
              <div className="flex gap-2">
                <PrimaryButton disabled={savingLicense} type="submit">
                  {savingLicense ? 'Saving...' : 'Save license'}
                </PrimaryButton>
                <SecondaryButton onClick={() => setEditingLicense(false)} type="button">
                  Cancel
                </SecondaryButton>
              </div>
            </form>
          )}
        </div>
      )}
      {error && <div className="mt-3">{<ErrorText>{error}</ErrorText>}</div>}
    </Card>
  );
}

function VersionHistory({ deckId }: { deckId: string }) {
  const { data: versions, isLoading } = useListStreamDeckVersionsQuery(deckId);

  return (
    <Card className="mt-6">
      <div className="flex items-center gap-2 border-b border-line p-4">
        <History aria-hidden="true" className="size-4 text-muted" />
        <p className="font-bold text-ink">Version history</p>
      </div>
      {isLoading ? (
        <p className="p-4 text-sm text-muted">Loading...</p>
      ) : versions && versions.length > 0 ? (
        <div className="divide-y divide-line">
          {versions.map((v) => (
            <div className="flex items-center justify-between gap-3 p-4" key={v.version}>
              <div>
                <p className="font-bold text-ink">v{v.version}</p>
                <p className="text-xs text-muted">{REASON_LABELS[v.createdReason] ?? v.createdReason}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-ink">{v.itemCount} recordings</p>
                <p className="text-xs text-muted">{new Date(v.createdAt).toLocaleString()}</p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="p-4 text-sm text-muted">No versions yet.</p>
      )}
    </Card>
  );
}

export default function StreamDeckDetailPage() {
  const params = useParams<{ deckId: string }>();
  const router = useRouter();
  const { data: deck, isLoading } = useGetStreamDeckQuery(params.deckId);
  const [removeItem] = useRemoveStreamDeckItemMutation();
  const [deleteDeck, { isLoading: deleting }] = useDeleteStreamDeckMutation();

  if (isLoading || !deck) {
    return <p className="text-sm text-muted">Loading...</p>;
  }

  const isSmart = deck.type === 'SMART';

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <PageHeading
          subtitle={`${deck.deckKey}${isSmart ? ' -- Smart Deck' : ''}`}
          title={deck.name}
        />
        <SecondaryButton
          disabled={deleting}
          onClick={async () => {
            await deleteDeck(deck.id).unwrap();
            router.push('/dashboard/decks');
          }}
          type="button"
        >
          Delete deck
        </SecondaryButton>
      </div>

      <SharingCard deck={deck} />

      {isSmart && <RuleEditor deckId={deck.id} rule={deck.rule} />}

      <Card>
        {deck.items && deck.items.length > 0 ? (
          <div className="divide-y divide-line">
            {deck.items.map((item) => (
              <div className="flex items-center justify-between gap-3 p-4" key={item.id}>
                <div>
                  <p className="font-mono text-sm text-ink">{item.recordingId}</p>
                  <p className="text-xs text-muted">
                    Added {new Date(item.addedAt).toLocaleDateString()}
                  </p>
                </div>
                {!isSmart && (
                  <SecondaryButton
                    onClick={() => void removeItem({ deckId: deck.id, itemId: item.id })}
                    type="button"
                  >
                    <Trash2 aria-hidden="true" className="size-3.5" />
                    Remove
                  </SecondaryButton>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="p-5 text-sm text-muted">
            {isSmart
              ? 'No recordings match this rule yet.'
              : 'No recordings yet. Add some from Explore Voice Data.'}
          </p>
        )}
      </Card>

      <VersionHistory deckId={deck.id} />
    </div>
  );
}

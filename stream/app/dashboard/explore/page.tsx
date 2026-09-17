'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { Play, ShieldCheck } from 'lucide-react';
import {
  useSearchCatalogueQuery,
  usePreviewRecordingMutation,
  useListStreamDecksQuery,
  useAddStreamDeckItemMutation,
  type IsvcConfidence,
} from '@/store/api';
import {
  Card,
  ErrorText,
  FieldLabel,
  PageHeading,
  SecondaryButton,
  TextInput,
} from '@/components/ui';
import { IsvcBadge } from '@/components/IsvcBadge';
import { QualityTierBadge } from '@/components/QualityTierBadge';
import { ValidationForm } from '@/components/ValidationForm';
import { DECK_MANAGER_ROLES, VALIDATION_ROLES } from '@/lib/route-access';

const CONFIDENCE_OPTIONS: IsvcConfidence[] = ['EMERGING', 'ESTABLISHED', 'HIGH', 'VERY_HIGH'];

export default function ExplorePage() {
  const { data: session } = useSession();
  const canManageDecks = Boolean(
    session?.user.orgRole && DECK_MANAGER_ROLES.includes(session.user.orgRole),
  );
  const canValidate = Boolean(
    session?.user.orgRole && VALIDATION_ROLES.includes(session.user.orgRole),
  );
  const [dialectTag, setDialectTag] = useState('');
  const [countryCode, setCountryCode] = useState('');
  const [minScore, setMinScore] = useState('');
  const [minIsvs, setMinIsvs] = useState('');
  const [minConfidence, setMinConfidence] = useState<IsvcConfidence | ''>('');
  const [sortBy, setSortBy] = useState<'newest' | 'isvs_desc'>('newest');
  const [page, setPage] = useState(1);

  const { data, isLoading, isError } = useSearchCatalogueQuery({
    dialectTag: dialectTag || undefined,
    countryCode: countryCode || undefined,
    minScore: minScore ? Number(minScore) : undefined,
    minIsvs: minIsvs ? Number(minIsvs) : undefined,
    minConfidence: minConfidence || undefined,
    sortBy,
    page,
    pageSize: 20,
  });

  const { data: decks } = useListStreamDecksQuery(undefined, { skip: !canManageDecks });
  const [preview, { isLoading: previewLoading }] = usePreviewRecordingMutation();
  const [addItem] = useAddStreamDeckItemMutation();
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [addTarget, setAddTarget] = useState<Record<string, string>>({});
  const [addError, setAddError] = useState<string | null>(null);
  const [validatingId, setValidatingId] = useState<string | null>(null);

  async function handlePreview(recordingId: string) {
    setPlayingId(recordingId);
    try {
      const result = await preview(recordingId).unwrap();
      setAudioUrl(result.url);
    } catch {
      setAudioUrl(null);
    }
  }

  async function handleAdd(recordingId: string) {
    const deckId = addTarget[recordingId];
    if (!deckId) return;
    setAddError(null);
    try {
      await addItem({ deckId, recordingId }).unwrap();
    } catch (err: any) {
      setAddError(err?.data?.message ?? 'Unable to add this recording to the deck.');
    }
  }

  return (
    <div>
      <PageHeading
        subtitle="Search, filter, and preview Dialect Library's voice recording catalogue."
        title="Explore Voice Data"
      />

      <Card className="mb-6 p-5">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <div>
            <FieldLabel>Country code</FieldLabel>
            <TextInput
              onChange={(e) => setCountryCode(e.target.value)}
              placeholder="NG"
              value={countryCode}
            />
          </div>
          <div>
            <FieldLabel>Dialect tag</FieldLabel>
            <TextInput
              onChange={(e) => setDialectTag(e.target.value)}
              placeholder="igbo"
              value={dialectTag}
            />
          </div>
          <div>
            <FieldLabel>Minimum DL score</FieldLabel>
            <TextInput
              max={100}
              min={0}
              onChange={(e) => setMinScore(e.target.value)}
              type="number"
              value={minScore}
            />
          </div>
          <div>
            <FieldLabel>Minimum ISVS</FieldLabel>
            <TextInput
              max={100}
              min={0}
              onChange={(e) => setMinIsvs(e.target.value)}
              type="number"
              value={minIsvs}
            />
          </div>
          <div>
            <FieldLabel>Minimum ISVC confidence</FieldLabel>
            <select
              className="min-h-10 w-full rounded-lg border border-line bg-white px-3 text-sm"
              onChange={(e) => setMinConfidence(e.target.value as IsvcConfidence | '')}
              value={minConfidence}
            >
              <option value="">Any</option>
              {CONFIDENCE_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {c.replace('_', ' ')}
                </option>
              ))}
            </select>
          </div>
          <div>
            <FieldLabel>Sort by</FieldLabel>
            <select
              className="min-h-10 w-full rounded-lg border border-line bg-white px-3 text-sm"
              onChange={(e) => setSortBy(e.target.value as 'newest' | 'isvs_desc')}
              value={sortBy}
            >
              <option value="newest">Newest</option>
              <option value="isvs_desc">Highest ISVC score</option>
            </select>
          </div>
          <div className="flex items-end">
            <SecondaryButton onClick={() => setPage(1)} type="button">
              Apply filters
            </SecondaryButton>
          </div>
        </div>
      </Card>

      {addError && <ErrorText>{addError}</ErrorText>}

      <Card>
        {isLoading ? (
          <p className="p-5 text-sm text-muted">Loading...</p>
        ) : isError ? (
          <p className="p-5 text-sm text-danger">Could not load the catalogue.</p>
        ) : data && data.items.length > 0 ? (
          <div className="divide-y divide-line">
            {data.items.map((item) => (
              <div
                className="grid gap-3 p-4 md:grid-cols-[1fr_auto] md:items-center"
                key={item.recordingId}
              >
                <div>
                  <p className="font-bold text-ink">
                    {item.dialect?.name ?? item.dialectTag}
                    {item.subdialect ? ` — ${item.subdialect.name}` : ''}
                  </p>
                  <p className="text-xs text-muted">
                    {item.country?.name ?? 'Unknown country'} ·{' '}
                    {((item.durationMs ?? 0) / 1000).toFixed(1)}s · DL score{' '}
                    {item.dlCanonicalScore ?? '—'}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <IsvcBadge
                      confidence={item.isvcConfidence}
                      isvs={item.isvs}
                      organizationCount={item.isvcOrganizationCount}
                    />
                    <QualityTierBadge tier={item.qualityTier} />
                  </div>
                  {playingId === item.recordingId && audioUrl && (
                    <audio className="mt-2" controls src={audioUrl} />
                  )}
                  {canValidate && validatingId === item.recordingId && (
                    <ValidationForm
                      onClose={() => setValidatingId(null)}
                      recordingId={item.recordingId}
                    />
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <SecondaryButton
                    disabled={previewLoading && playingId === item.recordingId}
                    onClick={() => void handlePreview(item.recordingId)}
                    type="button"
                  >
                    <Play aria-hidden="true" className="size-3.5" />
                    Preview
                  </SecondaryButton>
                  {canValidate && (
                    <SecondaryButton
                      onClick={() =>
                        setValidatingId((current) =>
                          current === item.recordingId ? null : item.recordingId,
                        )
                      }
                      type="button"
                    >
                      <ShieldCheck aria-hidden="true" className="size-3.5" />
                      Validate
                    </SecondaryButton>
                  )}
                  {canManageDecks && (
                    <>
                      <select
                        className="min-h-10 rounded-lg border border-line bg-white px-2 text-sm"
                        onChange={(e) =>
                          setAddTarget((prev) => ({ ...prev, [item.recordingId]: e.target.value }))
                        }
                        value={addTarget[item.recordingId] ?? ''}
                      >
                        <option value="">Select a deck...</option>
                        {(decks ?? []).map((deck) => (
                          <option key={deck.id} value={deck.id}>
                            {deck.name}
                          </option>
                        ))}
                      </select>
                      <SecondaryButton
                        disabled={!addTarget[item.recordingId]}
                        onClick={() => void handleAdd(item.recordingId)}
                        type="button"
                      >
                        Add to deck
                      </SecondaryButton>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="p-5 text-sm text-muted">No recordings match these filters.</p>
        )}
      </Card>

      {data && data.totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm text-muted">
            Page {data.page} of {data.totalPages}
          </p>
          <div className="flex gap-2">
            <SecondaryButton
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              type="button"
            >
              Previous
            </SecondaryButton>
            <SecondaryButton
              disabled={page >= data.totalPages}
              onClick={() => setPage((p) => p + 1)}
              type="button"
            >
              Next
            </SecondaryButton>
          </div>
        </div>
      )}
    </div>
  );
}

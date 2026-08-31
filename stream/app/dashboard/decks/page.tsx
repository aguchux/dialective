'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { Layers, Plus, ShieldCheck, Sparkles } from 'lucide-react';
import {
  IsvcConfidence,
  StreamDeckType,
  useCreateStreamDeckMutation,
  useListStreamDecksQuery,
} from '@/store/api';
import { Card, ErrorText, FieldLabel, PageHeading, PrimaryButton, TextInput } from '@/components/ui';

const CONFIDENCE_OPTIONS: IsvcConfidence[] = ['EMERGING', 'ESTABLISHED', 'HIGH', 'VERY_HIGH'];

export default function StreamDecksPage() {
  const { data: decks, isLoading } = useListStreamDecksQuery();
  const [createDeck, { isLoading: creating }] = useCreateStreamDeckMutation();
  const [name, setName] = useState('');
  const [type, setType] = useState<StreamDeckType>('MANUAL');
  const [countryCode, setCountryCode] = useState('');
  const [dialectTag, setDialectTag] = useState('');
  const [subdialectTag, setSubdialectTag] = useState('');
  const [minScore, setMinScore] = useState('');
  const [minIsvs, setMinIsvs] = useState('');
  const [minConfidence, setMinConfidence] = useState('');
  const [minOrganizationCount, setMinOrganizationCount] = useState('');
  const [minAudioQuality, setMinAudioQuality] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  function applyHighConfidenceTemplate() {
    setType('SMART');
    setMinConfidence('VERY_HIGH');
    setMinOrganizationCount('3');
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await createDeck({
        name,
        type,
        countryCode: countryCode || undefined,
        dialectTag: dialectTag || undefined,
        subdialectTag: subdialectTag || undefined,
        ...(type === 'SMART' && {
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
        }),
      }).unwrap();
      setName('');
      setShowForm(false);
    } catch (err: any) {
      setError(err?.data?.message ?? 'Unable to create this Stream Deck.');
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <PageHeading
          subtitle="Private, curated collections of voice recordings ready to stream."
          title="Stream Decks"
        />
        <PrimaryButton onClick={() => setShowForm((s) => !s)} type="button">
          <Plus aria-hidden="true" className="size-4" />
          New deck
        </PrimaryButton>
      </div>

      {showForm && (
        <Card className="mb-6 p-5">
          <form className="grid gap-4" onSubmit={submit}>
            <div>
              <FieldLabel>Deck name</FieldLabel>
              <TextInput onChange={(e) => setName(e.target.value)} required value={name} />
            </div>

            <button
              className="flex items-center gap-2 self-start rounded-lg border border-line bg-surface-muted px-3 py-2 text-xs font-bold text-ink transition-colors hover:border-accent"
              onClick={applyHighConfidenceTemplate}
              type="button"
            >
              <ShieldCheck aria-hidden="true" className="size-3.5 text-success" />
              Start from &quot;High-Confidence Package&quot; template
            </button>

            <div>
              <FieldLabel>Deck type</FieldLabel>
              <div className="flex gap-2">
                <button
                  className={`flex-1 rounded-lg border px-3 py-2.5 text-sm font-bold transition-colors ${
                    type === 'MANUAL' ? 'border-accent bg-accent/10 text-accent-dark' : 'border-line bg-white text-ink'
                  }`}
                  onClick={() => setType('MANUAL')}
                  type="button"
                >
                  Manual
                </button>
                <button
                  className={`flex-1 rounded-lg border px-3 py-2.5 text-sm font-bold transition-colors ${
                    type === 'SMART' ? 'border-accent bg-accent/10 text-accent-dark' : 'border-line bg-white text-ink'
                  }`}
                  onClick={() => setType('SMART')}
                  type="button"
                >
                  <Sparkles aria-hidden="true" className="mr-1 inline size-3.5" />
                  Smart
                </button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <FieldLabel>Country</FieldLabel>
                <TextInput
                  onChange={(e) => setCountryCode(e.target.value)}
                  placeholder="NG"
                  value={countryCode}
                />
              </div>
              <div>
                <FieldLabel>Dialect</FieldLabel>
                <TextInput
                  onChange={(e) => setDialectTag(e.target.value)}
                  placeholder="igbo"
                  value={dialectTag}
                />
              </div>
              <div>
                <FieldLabel>Subdialect</FieldLabel>
                <TextInput
                  onChange={(e) => setSubdialectTag(e.target.value)}
                  placeholder="nsukka"
                  value={subdialectTag}
                />
              </div>
            </div>

            {type === 'SMART' && (
              <div className="grid gap-3 rounded-lg border border-line bg-surface-muted p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-muted">
                  Rule -- recordings are added automatically when they match
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <FieldLabel>Min DL Canonical Score</FieldLabel>
                    <TextInput
                      max={100}
                      min={0}
                      onChange={(e) => setMinScore(e.target.value)}
                      type="number"
                      value={minScore}
                    />
                  </div>
                  <div>
                    <FieldLabel>Min ISVS</FieldLabel>
                    <TextInput
                      max={100}
                      min={0}
                      onChange={(e) => setMinIsvs(e.target.value)}
                      type="number"
                      value={minIsvs}
                    />
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
              </div>
            )}

            <div>
              <PrimaryButton disabled={creating} type="submit">
                {creating ? 'Creating...' : 'Create'}
              </PrimaryButton>
            </div>
          </form>
          {error && <div className="mt-3">{<ErrorText>{error}</ErrorText>}</div>}
        </Card>
      )}

      {isLoading ? (
        <p className="text-sm text-muted">Loading...</p>
      ) : decks && decks.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {decks.map((deck) => (
            <Link href={`/dashboard/decks/${deck.id}`} key={deck.id}>
              <Card className="p-5 transition-shadow hover:shadow-md">
                <div className="mb-2 flex items-center justify-between">
                  <Layers aria-hidden="true" className="size-5 text-accent" />
                  {deck.type === 'SMART' && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-xs font-bold text-accent-dark">
                      <Sparkles aria-hidden="true" className="size-3" />
                      Smart
                    </span>
                  )}
                </div>
                <p className="font-bold text-ink">{deck.name}</p>
                <p className="mt-1 text-xs text-muted">{deck.deckKey}</p>
                <p className="mt-2 text-sm text-muted">{deck._count?.items ?? 0} recordings</p>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <Card className="p-8 text-center">
          <p className="text-sm text-muted">
            You haven&apos;t created a Stream Deck yet. Create one, then add recordings from
            Explore Voice Data.
          </p>
        </Card>
      )}
    </div>
  );
}

'use client';

import {
  Check,
  ChevronDown,
  Clock3,
  Code2,
  Headphones,
  Plus,
  ShieldCheck,
  UserRound,
  X,
} from 'lucide-react';
import type { CatalogueCollection, ValidationBreakdown } from './types';
import {
  CoverImage,
  formatDuration,
  formatHours,
  formatSpeakers,
  PlayButton,
  ScoreBadge,
  VerifiedMark,
  Waveform,
} from './primitives';

export function CollectionInspector({
  added,
  collection,
  isPlaying,
  onAdd,
  onClose,
  onTogglePlay,
  validation,
}: {
  added: boolean;
  collection: CatalogueCollection | null;
  isPlaying: boolean;
  onAdd: () => void;
  onClose: () => void;
  onTogglePlay: () => void;
  validation: ValidationBreakdown[];
}) {
  if (!collection) {
    return (
      <div className="grid min-h-[60vh] place-items-center p-6 text-center">
        <div>
          <Headphones aria-hidden="true" className="mx-auto size-8 text-catalogue-dim" />
          <p className="mt-3 text-sm font-semibold text-catalogue-ink">Select a collection</p>
          <p className="mt-1 text-xs leading-relaxed text-catalogue-muted">
            Choose a voice dataset to inspect its validation and preview sample.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="stream-catalogue-scrollbar h-full overflow-y-auto px-5 pb-8 pt-5 lg:px-4">
      <div className="flex items-start gap-3">
        <CoverImage
          alt={collection.coverAlt}
          className="size-16 shrink-0 rounded-lg object-cover"
          height={64}
          src={collection.coverUrl}
          width={64}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h2 className="truncate text-lg font-bold text-catalogue-ink">{collection.title}</h2>
            <VerifiedMark />
          </div>
          <p className="mt-1 text-xs text-catalogue-muted">{collection.subtitle}</p>
          <span className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-catalogue-green/25 bg-catalogue-green/10 px-2 py-1 text-[10px] font-semibold text-catalogue-green">
            <span className="size-1.5 rounded-full bg-catalogue-green" />
            Verified
          </span>
        </div>
        <button
          aria-label="Close collection details"
          className="grid size-8 shrink-0 place-items-center rounded-lg text-catalogue-muted hover:bg-catalogue-surface-hover hover:text-catalogue-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-catalogue-blue/60"
          onClick={onClose}
          type="button"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      </div>

      <div className="mt-5 grid grid-cols-3 divide-x divide-catalogue-line border-y border-catalogue-line py-3">
        <InspectorMetric icon={Clock3} label="Duration" value={formatHours(collection.hours)} />
        <InspectorMetric
          icon={UserRound}
          label="Speakers"
          value={formatSpeakers(collection.speakers)}
        />
        <InspectorMetric
          icon={ShieldCheck}
          label="Quality score"
          value={`${collection.qualityScore.toFixed(1)}/10`}
        />
      </div>

      <section className="mt-5">
        <h3 className="text-xs font-bold text-catalogue-ink">About this collection</h3>
        <p className="mt-2 text-xs leading-relaxed text-catalogue-muted">
          {collection.description}
        </p>
        <dl className="mt-4 grid gap-2 text-[11px]">
          <MetadataRow label="Language" value={collection.language} />
          <MetadataRow label="Country" value={collection.country} />
          <MetadataRow label="Dialect" value={collection.dialect} />
          <MetadataRow label="Subdialect" value={collection.subdialect} />
          <MetadataRow label="Recording Quality" value={collection.recordingQuality} />
          <MetadataRow
            label="License"
            value={collection.license}
            valueClassName="text-catalogue-green"
          />
          <MetadataRow label="Last Updated" value={collection.lastUpdated} />
        </dl>
      </section>

      <section className="mt-5 border-t border-catalogue-line pt-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-catalogue-dim">
          Preview sample
        </p>
        <p className="mt-2 truncate text-xs font-semibold text-catalogue-ink">
          {collection.preview.title}
        </p>
        <div className="mt-3 flex items-center gap-3">
          <PlayButton
            label={isPlaying ? 'Pause preview' : 'Play preview'}
            onClick={onTogglePlay}
            size="lg"
          />
          <div className="min-w-0 flex-1">
            <div className="h-10">
              <Waveform
                active={isPlaying}
                bars={collection.preview.waveform}
                progress={isPlaying ? 0.42 : 0.12}
              />
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-catalogue-dim">
              <span>{isPlaying ? '0:12' : '0:00'}</span>
              <span>{formatDuration(collection.preview.durationSeconds)}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-5 border-t border-catalogue-line pt-4" id="validation">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-xs font-bold text-catalogue-ink">Validation Score</h3>
          <span className="text-lg font-semibold text-catalogue-blue-bright">
            {collection.qualityScore.toFixed(1)}/10
          </span>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-catalogue-line-strong">
          <span
            className="block h-full rounded-full bg-catalogue-blue"
            style={{ width: `${collection.qualityScore * 10}%` }}
          />
        </div>
        <div className="mt-4 grid gap-2.5">
          {validation.map((item) => (
            <div className="flex items-center justify-between gap-3 text-[11px]" key={item.label}>
              <span className="flex min-w-0 items-center gap-2 text-catalogue-muted">
                <Check aria-hidden="true" className="size-3 shrink-0 text-catalogue-green" />
                <span className="truncate">{item.label}</span>
              </span>
              <span className="shrink-0 text-catalogue-ink">{item.score.toFixed(1)}/10</span>
            </div>
          ))}
        </div>
      </section>

      <div className="mt-6 grid grid-cols-3 gap-2">
        <button
          className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg bg-catalogue-blue px-2 text-[11px] font-bold text-white hover:bg-catalogue-blue-bright focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-catalogue-blue/60"
          onClick={onTogglePlay}
          type="button"
        >
          <Headphones aria-hidden="true" className="size-3.5" />
          Preview
        </button>
        <button
          className={`inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border px-2 text-[11px] font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-catalogue-blue/60 ${
            added
              ? 'border-catalogue-green/40 bg-catalogue-green/10 text-catalogue-green'
              : 'border-catalogue-line-strong text-catalogue-ink hover:bg-catalogue-surface-hover'
          }`}
          onClick={onAdd}
          type="button"
        >
          {added ? (
            <Check aria-hidden="true" className="size-3.5" />
          ) : (
            <Plus aria-hidden="true" className="size-3.5" />
          )}
          {added ? 'Added' : 'Add to Deck'}
        </button>
        <button
          className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-catalogue-line-strong px-2 text-[11px] font-bold text-catalogue-ink hover:bg-catalogue-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-catalogue-blue/60"
          type="button"
        >
          <Code2 aria-hidden="true" className="size-3.5" />
          Stream API
        </button>
      </div>
    </div>
  );
}

function InspectorMetric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Clock3;
  label: string;
  value: string;
}) {
  return (
    <div className="grid justify-items-center gap-1 px-2 text-center">
      <Icon aria-hidden="true" className="size-3.5 text-catalogue-muted" />
      <span className="text-xs font-semibold text-catalogue-ink">{value}</span>
      <span className="text-[9px] text-catalogue-dim">{label}</span>
    </div>
  );
}

function MetadataRow({
  label,
  value,
  valueClassName = 'text-catalogue-ink',
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.2fr)] gap-2">
      <dt className="text-catalogue-dim">{label}</dt>
      <dd className={`min-w-0 truncate ${valueClassName}`}>{value}</dd>
    </div>
  );
}

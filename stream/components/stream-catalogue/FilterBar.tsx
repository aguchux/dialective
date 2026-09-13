'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, SlidersHorizontal, X } from 'lucide-react';
import type { CatalogueFilters, FilterKey } from './types';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'language', label: 'Language' },
  { key: 'country', label: 'Country' },
  { key: 'dialect', label: 'Dialect' },
  { key: 'subdialect', label: 'Subdialect' },
  { key: 'quality', label: 'Quality Score' },
  { key: 'license', label: 'License' },
];

export function FilterBar({
  filters,
  onClear,
  onChange,
  options,
}: {
  filters: CatalogueFilters;
  onClear: () => void;
  onChange: (key: FilterKey, value: string | null) => void;
  options: Record<FilterKey, string[]>;
}) {
  const [panelOpen, setPanelOpen] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);
  const hasFilters = Object.values(filters).some(Boolean);
  const activeCount = Object.values(filters).filter(Boolean).length;

  useEffect(() => {
    if (!panelOpen) return;
    function handlePointerDown(event: PointerEvent) {
      if (!barRef.current?.contains(event.target as Node)) setPanelOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setPanelOpen(false);
    }
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [panelOpen]);

  return (
    <div className="relative" ref={barRef}>
      <div className="stream-catalogue-scrollbar flex min-w-0 items-center gap-2 overflow-x-auto pb-1">
        <button
          aria-expanded={panelOpen}
          className={`flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-catalogue-blue/60 ${
            activeCount > 0
              ? 'border-catalogue-blue/70 bg-catalogue-blue-soft text-catalogue-blue-bright'
              : 'border-catalogue-line bg-catalogue-surface text-catalogue-muted hover:bg-catalogue-surface-hover hover:text-catalogue-ink'
          }`}
          onClick={() => setPanelOpen((current) => !current)}
          type="button"
        >
          <SlidersHorizontal aria-hidden="true" className="size-3.5" />
          Filters
          {activeCount > 0 && (
            <span className="grid size-4 place-items-center rounded-full bg-catalogue-blue text-[9px] font-bold text-white">
              {activeCount}
            </span>
          )}
          <ChevronDown
            aria-hidden="true"
            className={`size-3.5 transition-transform ${panelOpen ? 'rotate-180' : ''}`}
          />
        </button>

        {FILTERS.filter((filter) => filters[filter.key]).map((filter) => (
          <button
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-catalogue-blue/70 bg-catalogue-blue-soft px-3 text-xs font-semibold text-catalogue-blue-bright"
            key={filter.key}
            onClick={() => onChange(filter.key, null)}
            type="button"
          >
            {filters[filter.key]}
            <X aria-hidden="true" className="size-3" />
          </button>
        ))}

        {hasFilters && (
          <button
            className="inline-flex h-8 shrink-0 items-center gap-1.5 px-2 text-xs font-semibold text-catalogue-blue-bright hover:text-catalogue-ink"
            onClick={onClear}
            type="button"
          >
            <X aria-hidden="true" className="size-3.5" />
            Clear all
          </button>
        )}
      </div>

      {panelOpen && (
        <div className="absolute left-0 top-10 z-30 grid w-full min-w-[320px] gap-4 rounded-[10px] border border-catalogue-line-strong bg-catalogue-surface-raised p-4 shadow-catalogue sm:grid-cols-2 lg:grid-cols-3">
          {FILTERS.map((filter) => (
            <FilterGroup
              filter={filter}
              key={filter.key}
              onChange={onChange}
              options={options[filter.key]}
              value={filters[filter.key]}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FilterGroup({
  filter,
  onChange,
  options,
  value,
}: {
  filter: { key: FilterKey; label: string };
  onChange: (key: FilterKey, value: string | null) => void;
  options: string[];
  value: string | null;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-catalogue-dim">
        {filter.label}
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {options.map((option) => {
          const selected = option === value;
          return (
            <button
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                selected
                  ? 'border-catalogue-blue/70 bg-catalogue-blue text-white'
                  : 'border-catalogue-line bg-catalogue-surface text-catalogue-muted hover:bg-catalogue-surface-hover hover:text-catalogue-ink'
              }`}
              key={option}
              onClick={() => onChange(filter.key, selected ? null : option)}
              type="button"
            >
              {selected && <Check aria-hidden="true" className="size-3" />}
              {option}
            </button>
          );
        })}
      </div>
    </div>
  );
}

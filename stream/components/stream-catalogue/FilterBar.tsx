'use client';

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
  const hasFilters = Object.values(filters).some(Boolean);

  return (
    <div className="stream-catalogue-scrollbar flex min-w-0 items-center gap-2 overflow-x-auto pb-1">
      <SlidersHorizontal aria-hidden="true" className="ml-1 size-4 shrink-0 text-catalogue-muted" />
      {FILTERS.map((filter) => (
        <FilterButton
          filter={filter}
          key={filter.key}
          onChange={onChange}
          options={options[filter.key]}
          value={filters[filter.key]}
        />
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
  );
}

function FilterButton({
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
    <details className="group relative shrink-0">
      <summary
        className={`flex h-8 cursor-pointer list-none items-center gap-2 rounded-lg border px-3 text-xs font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-catalogue-blue/60 ${
          value
            ? 'border-catalogue-blue/70 bg-catalogue-blue-soft text-catalogue-blue-bright'
            : 'border-catalogue-line bg-catalogue-surface text-catalogue-muted hover:bg-catalogue-surface-hover hover:text-catalogue-ink'
        }`}
      >
        {value ?? filter.label}
        <ChevronDown
          aria-hidden="true"
          className="size-3.5 transition-transform group-open:rotate-180"
        />
      </summary>
      <div className="absolute left-0 top-10 z-20 min-w-40 overflow-hidden rounded-lg border border-catalogue-line-strong bg-catalogue-surface-raised p-1 shadow-catalogue">
        {options.map((option) => (
          <button
            className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-xs text-catalogue-muted hover:bg-catalogue-surface-hover hover:text-catalogue-ink"
            key={option}
            onClick={(event) => {
              event.currentTarget.closest('details')?.removeAttribute('open');
              onChange(filter.key, option === value ? null : option);
            }}
            type="button"
          >
            {option}
            {option === value && (
              <Check aria-hidden="true" className="size-3.5 text-catalogue-blue-bright" />
            )}
          </button>
        ))}
      </div>
    </details>
  );
}

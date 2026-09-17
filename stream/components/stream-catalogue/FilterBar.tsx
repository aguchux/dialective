'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Check, ChevronDown, SlidersHorizontal, X } from 'lucide-react';
import type { CatalogueFilters, FilterKey } from './types';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'country', label: 'Country' },
  { key: 'dialect', label: 'Dialect' },
  { key: 'subdialect', label: 'Subdialect' },
  { key: 'quality', label: 'Quality Score' },
  { key: 'license', label: 'License' },
];

// Each cascading field requires the one before it to be picked first:
// Country -> Dialect -> Subdialect. Quality Score and License stay
// available once a country is chosen (they don't need dialect/subdialect).
const PREREQUISITE: Partial<Record<FilterKey, FilterKey>> = {
  dialect: 'country',
  subdialect: 'dialect',
  quality: 'country',
  license: 'country',
};

function isFilterLocked(key: FilterKey, filters: CatalogueFilters): boolean {
  const prerequisite = PREREQUISITE[key];
  return prerequisite ? !filters[prerequisite] : false;
}

function prerequisiteLabel(key: FilterKey): string {
  const prerequisite = PREREQUISITE[key];
  return prerequisite ? (FILTERS.find((filter) => filter.key === prerequisite)?.label ?? '') : '';
}

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
  const [openKey, setOpenKey] = useState<FilterKey | null>(null);
  const hasFilters = Object.values(filters).some(Boolean);

  return (
    <div className="stream-catalogue-scrollbar flex min-w-0 items-center gap-2 overflow-x-auto pb-1">
      <SlidersHorizontal aria-hidden="true" className="ml-1 size-4 shrink-0 text-catalogue-muted" />
      {FILTERS.map((filter) => (
        <FilterButton
          disabled={isFilterLocked(filter.key, filters)}
          filter={filter}
          isOpen={openKey === filter.key}
          key={filter.key}
          onChange={onChange}
          onToggle={() => setOpenKey((current) => (current === filter.key ? null : filter.key))}
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
  disabled = false,
  filter,
  isOpen,
  onChange,
  onToggle,
  options,
  value,
}: {
  disabled?: boolean;
  filter: { key: FilterKey; label: string };
  isOpen: boolean;
  onChange: (key: FilterKey, value: string | null) => void;
  onToggle: () => void;
  options: string[];
  value: string | null;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelStyle, setPanelStyle] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    if (!isOpen) {
      setPanelStyle(null);
      return;
    }
    function place() {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const panelWidth = panelRef.current?.offsetWidth ?? 176;
      const left = Math.min(rect.left, window.innerWidth - panelWidth - 12);
      setPanelStyle({ left: Math.max(12, left), top: rect.bottom + 6 });
    }
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      onToggle();
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onToggle();
    }
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  return (
    <>
      <button
        aria-expanded={isOpen}
        className={`flex h-8 shrink-0 items-center gap-2 rounded-lg border px-3 text-xs font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-catalogue-blue/60 ${
          disabled ? 'cursor-not-allowed opacity-40' : ''
        } ${
          value
            ? 'border-catalogue-blue/70 bg-catalogue-blue-soft text-catalogue-blue-bright'
            : 'border-catalogue-line bg-catalogue-surface text-catalogue-muted hover:bg-catalogue-surface-hover hover:text-catalogue-ink'
        }`}
        disabled={disabled}
        onClick={onToggle}
        ref={buttonRef}
        title={disabled ? `Choose ${prerequisiteLabel(filter.key)} first` : undefined}
        type="button"
      >
        {value ?? filter.label}
        <ChevronDown
          aria-hidden="true"
          className={`size-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>
      {isOpen && (
        <div
          className="fixed z-50 min-w-44 overflow-hidden rounded-lg border border-catalogue-line-strong bg-catalogue-surface-raised p-1 shadow-catalogue"
          ref={panelRef}
          style={{
            left: panelStyle?.left ?? -9999,
            top: panelStyle?.top ?? -9999,
            visibility: panelStyle ? 'visible' : 'hidden',
          }}
        >
          {options.length === 0 ? (
            <p className="px-3 py-2 text-xs text-catalogue-dim">No matching options.</p>
          ) : (
            options.map((option) => (
              <button
                className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-xs text-catalogue-muted hover:bg-catalogue-surface-hover hover:text-catalogue-ink"
                key={option}
                onClick={() => {
                  onChange(filter.key, option === value ? null : option);
                  onToggle();
                }}
                type="button"
              >
                {option}
                {option === value && (
                  <Check aria-hidden="true" className="size-3.5 text-catalogue-blue-bright" />
                )}
              </button>
            ))
          )}
        </div>
      )}
    </>
  );
}

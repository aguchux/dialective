'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

export interface SearchableSelectOption {
  value: string;
  label: string;
}

/**
 * A text-filterable single-select, for a list too long for a plain <select>
 * to be usable (e.g. Nigeria alone has 20+ banks). No portal/popover lib --
 * this is meant to live inside a Dialog, and a Radix Popover nested inside
 * a Dialog fights that Dialog's own focus trap and outside-click dismissal.
 * The dropdown is a plain absolutely-positioned list inside this component's
 * own relative wrapper instead.
 */
export function SearchableSelect({
  className = '',
  disabled = false,
  emptyLabel = 'No matches',
  loading = false,
  loadingLabel = 'Loading...',
  onChange,
  options,
  placeholder = 'Search...',
  value,
}: {
  className?: string;
  disabled?: boolean;
  emptyLabel?: string;
  loading?: boolean;
  loadingLabel?: string;
  onChange: (value: string) => void;
  options: SearchableSelectOption[];
  placeholder?: string;
  value: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlighted, setHighlighted] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const selected = options.find((option) => option.value === value) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((option) => option.label.toLowerCase().includes(q));
  }, [options, query]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  useEffect(() => {
    setHighlighted(0);
  }, [query, open]);

  function commit(option: SearchableSelectOption) {
    onChange(option.value);
    setQuery('');
    setOpen(false);
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (!open && (event.key === 'ArrowDown' || event.key === 'Enter')) {
      setOpen(true);
      return;
    }
    if (!open) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlighted((current) => Math.min(current + 1, filtered.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlighted((current) => Math.max(current - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const option = filtered[highlighted];
      if (option) commit(option);
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div className="relative" ref={rootRef}>
      <input
        aria-expanded={open}
        aria-haspopup="listbox"
        autoComplete="off"
        className={className}
        disabled={disabled || loading}
        onChange={(event) => {
          setQuery(event.target.value);
          if (!open) setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={loading ? loadingLabel : placeholder}
        ref={inputRef}
        role="combobox"
        type="text"
        value={open ? query : (selected?.label ?? '')}
      />
      {open && (
        <ul
          className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-line bg-white py-1 shadow-lg dark:bg-surface"
          role="listbox"
        >
          {filtered.length === 0 && (
            <li className="px-3 py-2 text-sm text-muted">{loading ? loadingLabel : emptyLabel}</li>
          )}
          {filtered.map((option, index) => (
            <li key={option.value}>
              <button
                aria-selected={option.value === value}
                className={`block w-full px-3 py-2 text-left text-sm ${
                  index === highlighted ? 'bg-accent-soft text-accent' : 'hover:bg-surface-muted'
                }`}
                onClick={() => commit(option)}
                onMouseEnter={() => setHighlighted(index)}
                role="option"
                type="button"
              >
                {option.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

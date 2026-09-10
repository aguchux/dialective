'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';

export interface SettingsSearchMatch {
  panelKey: string;
  panelLabel: string;
  fieldLabel: string;
  element: HTMLElement;
}

const MAX_RESULTS = 30;

/**
 * Scans the already-rendered DOM of every settings panel (each wrapped in a
 * `[data-settings-panel]` container -- see page.tsx) rather than a
 * hand-maintained index, so this can never drift out of sync with whatever
 * labels a panel actually renders. Every panel already mounts an <h2> title
 * and one <label> per field (confirmed across all 24 panels), which is all
 * this needs to find matches.
 */
function collectMatches(container: HTMLElement, query: string): SettingsSearchMatch[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];

  const matches: SettingsSearchMatch[] = [];
  const panels = container.querySelectorAll<HTMLElement>('[data-settings-panel]');

  for (const panel of panels) {
    const panelKey = panel.dataset.settingsPanel ?? '';
    const panelLabel = panel.dataset.panelLabel ?? panelKey;

    const labels = panel.querySelectorAll<HTMLElement>('label');
    for (const label of labels) {
      // label.textContent includes any nested input's rendered text (e.g. a
      // <select>'s selected <option>), which would make search match on the
      // *current value* rather than the field's name -- clone and strip
      // form controls before reading text so only the label's own wording
      // counts.
      const clone = label.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('input, select, textarea, button').forEach((el) => el.remove());
      const text = clone.textContent?.replace(/\s+/g, ' ').trim() ?? '';
      if (text && text.toLowerCase().includes(needle)) {
        matches.push({ panelKey, panelLabel, fieldLabel: text, element: label });
      }
    }

    const heading = panel.querySelector<HTMLElement>('h2');
    const headingText = heading?.textContent?.trim() ?? '';
    if (heading && headingText && headingText.toLowerCase().includes(needle)) {
      matches.push({ panelKey, panelLabel, fieldLabel: headingText, element: heading });
    }

    if (matches.length >= MAX_RESULTS) break;
  }

  return matches.slice(0, MAX_RESULTS);
}

export function SettingsSearch({
  containerRef,
  onNavigate,
  onMatchedPanelsChange,
}: {
  containerRef: React.RefObject<HTMLElement>;
  onNavigate: (match: SettingsSearchMatch) => void;
  onMatchedPanelsChange: (panelKeys: Set<string> | null) => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const matches = useMemo(() => {
    if (!containerRef.current || query.trim().length < 2) return [];
    return collectMatches(containerRef.current, query);
  }, [containerRef, query]);

  useEffect(() => {
    if (query.trim().length < 2) {
      onMatchedPanelsChange(null);
      return;
    }
    onMatchedPanelsChange(new Set(matches.map((m) => m.panelKey)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matches, query]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const showDropdown = open && query.trim().length >= 2;

  return (
    <div className="relative" ref={boxRef}>
      <div className="relative">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
        />
        <input
          aria-label="Search all settings"
          className="min-h-10 w-full rounded-lg border border-line bg-white py-2 pl-9 pr-3 text-sm text-ink dark:bg-surface-muted"
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search all settings..."
          type="search"
          value={query}
        />
      </div>

      {showDropdown && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-96 overflow-y-auto rounded-lg border border-line bg-white shadow-lg dark:bg-surface">
          {matches.length === 0 ? (
            <p className="p-3 text-sm text-muted">No settings match &ldquo;{query}&rdquo;.</p>
          ) : (
            <ul className="divide-y divide-line">
              {matches.map((match, index) => (
                <li key={`${match.panelKey}-${index}`}>
                  <button
                    className="flex w-full flex-col gap-0.5 px-3 py-2 text-left text-sm hover:bg-surface-muted"
                    onClick={() => {
                      onNavigate(match);
                      setOpen(false);
                    }}
                    type="button"
                  >
                    <span className="font-bold text-ink">{match.fieldLabel}</span>
                    <span className="text-xs text-muted">{match.panelLabel}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

'use client';

import { useMemo, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { Dialog, DialogClose, DialogContent, DialogTrigger } from '@/components/ui/Dialog';

export interface CurrencyPickerOption {
  code: string;
  /** Extra context shown next to the code, e.g. the country/countries that use it -- helps an admin recognize an unfamiliar 3-letter code. May be truncated/summarized (e.g. "+3 more") for a widely-shared currency; see fullLabel for the untruncated version. */
  label?: string;
  /** Untruncated version of label, shown as a hover tooltip when it differs from label -- lets an admin see every country for a widely-shared currency without cluttering the grid. */
  fullLabel?: string;
}

const inputClass =
  'min-h-10 w-full rounded-lg border border-line bg-white px-3 py-2.5 text-ink dark:bg-surface-muted';

function parseCsv(value: string): string[] {
  return value
    .split(',')
    .map((v) => v.trim().toUpperCase())
    .filter(Boolean);
}

/**
 * Multi-select for a CSV-of-currency-codes settings field (P2P settlement
 * currencies, Flutterwave allowed currencies, etc.) -- replaces a raw text
 * input an admin had to hand-type/comma-separate correctly with a checklist
 * dialog seeded from real known currency codes, so a typo can't silently
 * exclude a whole currency. The underlying form state stays a plain CSV
 * string (value/onChange), unchanged from the text-input version, so
 * callers don't need to touch their save payload.
 */
export function CurrencyPicker({
  value,
  onChange,
  options,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  options: CurrencyPickerOption[];
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>([]);
  const [search, setSearch] = useState('');

  const selected = useMemo(() => parseCsv(value), [value]);
  const allCodes = useMemo(() => options.map((o) => o.code), [options]);

  function openDialog() {
    setDraft(selected);
    setSearch('');
    setOpen(true);
  }

  function toggle(code: string) {
    setDraft((current) =>
      current.includes(code) ? current.filter((c) => c !== code) : [...current, code],
    );
  }

  function selectAll() {
    setDraft(allCodes);
  }

  function clearAll() {
    setDraft([]);
  }

  function save() {
    onChange(draft.join(','));
    setOpen(false);
  }

  const filteredOptions = options.filter((option) => {
    if (!search.trim()) return true;
    const needle = search.trim().toLowerCase();
    return (
      option.code.toLowerCase().includes(needle) ||
      (option.label?.toLowerCase().includes(needle) ?? false)
    );
  });

  const allSelected = allCodes.length > 0 && allCodes.every((code) => draft.includes(code));

  return (
    <div className="grid gap-1.5">
      <span className="font-bold">{label}</span>
      <Dialog onOpenChange={setOpen} open={open}>
        <DialogTrigger asChild>
          <button
            className={`${inputClass} flex flex-wrap items-center gap-1.5 text-left`}
            onClick={openDialog}
            type="button"
          >
            {selected.length === 0 ? (
              <span className="text-muted">Select currencies…</span>
            ) : (
              selected.map((code) => (
                <span
                  className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-extrabold text-accent"
                  key={code}
                >
                  {code}
                </span>
              ))
            )}
            <ChevronDown className="ml-auto size-4 shrink-0 text-muted" aria-hidden="true" />
          </button>
        </DialogTrigger>
        <DialogContent
          description="Currencies drawn from every coverage country, plus any settlement-only assets. Untick to remove, or use Select all."
          title={label}
        >
          <div className="grid gap-3">
            <input
              className={inputClass}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search code or country…"
              value={search}
            />

            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-bold text-muted">
                {draft.length} of {allCodes.length} selected
              </p>
              <div className="flex gap-2">
                <button
                  className="min-h-8 rounded-lg border border-line px-3 text-xs font-extrabold hover:bg-surface-muted"
                  disabled={allSelected}
                  onClick={selectAll}
                  type="button"
                >
                  Select all
                </button>
                <button
                  className="min-h-8 rounded-lg border border-line px-3 text-xs font-extrabold hover:bg-surface-muted"
                  disabled={draft.length === 0}
                  onClick={clearAll}
                  type="button"
                >
                  Clear all
                </button>
              </div>
            </div>

            <div className="grid max-h-80 grid-cols-1 gap-1.5 overflow-y-auto rounded-lg border border-line p-2 sm:grid-cols-2">
              {filteredOptions.length === 0 && (
                <p className="col-span-full py-4 text-center text-sm text-muted">
                  No currencies match &ldquo;{search}&rdquo;.
                </p>
              )}
              {filteredOptions.map((option) => {
                const isChecked = draft.includes(option.code);
                return (
                  <label
                    className={`flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border px-2.5 text-sm font-bold ${
                      isChecked ? 'border-accent bg-accent-soft text-accent' : 'border-line'
                    }`}
                    key={option.code}
                  >
                    <input
                      checked={isChecked}
                      className="sr-only"
                      onChange={() => toggle(option.code)}
                      type="checkbox"
                    />
                    <span
                      className={`grid size-4 shrink-0 place-items-center rounded border ${
                        isChecked ? 'border-accent bg-accent text-white' : 'border-line'
                      }`}
                    >
                      {isChecked && <Check className="size-3" aria-hidden="true" strokeWidth={3} />}
                    </span>
                    <span
                      className="truncate"
                      title={`${option.code} ${option.fullLabel ?? option.label ?? ''}`.trim()}
                    >
                      {option.code}
                      {option.label && (
                        <span className="ml-1 font-normal text-muted">{option.label}</span>
                      )}
                    </span>
                  </label>
                );
              })}
            </div>

            <div className="flex justify-end gap-2">
              <DialogClose className="min-h-10 rounded-lg border border-line bg-white px-4 font-bold hover:bg-surface-muted">
                Cancel
              </DialogClose>
              <button
                className="min-h-10 rounded-lg bg-accent px-4 font-extrabold text-white hover:bg-accent-dark"
                onClick={save}
                type="button"
              >
                Done
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

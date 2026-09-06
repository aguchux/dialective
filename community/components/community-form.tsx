'use client';

import { useState } from 'react';
import { FileText, Image as ImageIcon, LockKeyhole, Mic2, X } from 'lucide-react';
import { IconButton, StatusBanner } from './ui';

export function TagInput({
  tags,
  onChange,
  suggestions = [],
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  suggestions?: { id: string; name: string }[];
}) {
  const [value, setValue] = useState('');

  function addTag(raw: string) {
    const tag = raw.trim().replace(/^#/, '').replace(/\s+/g, ' ');
    if (!tag || tags.length >= 5 || tags.some((item) => item.toLowerCase() === tag.toLowerCase()))
      return;
    onChange([...tags, tag]);
    setValue('');
  }

  return (
    <div>
      <div className="flex min-h-11 min-w-0 flex-wrap items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 transition-colors focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/15">
        {tags.map((tag) => (
          <span
            className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-1 text-xs font-bold text-accent-dark"
            key={tag}
          >
            #{tag}
            <IconButton
              className="-mr-1 size-8 rounded-full"
              label={`Remove ${tag}`}
              onClick={() => onChange(tags.filter((item) => item !== tag))}
            >
              <X aria-hidden="true" className="size-3" />
            </IconButton>
          </span>
        ))}
        <input
          aria-label="Add tags"
          className="min-w-32 flex-1 border-0 bg-transparent py-1 text-base text-ink outline-none placeholder:text-muted/75"
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ',') {
              event.preventDefault();
              addTag(value);
            }
            if (event.key === 'Backspace' && !value && tags.length) onChange(tags.slice(0, -1));
          }}
          placeholder={tags.length ? 'Add another tag' : 'Add tags e.g. Igbo, Recording Tips'}
          value={value}
        />
      </div>
      {!!value && suggestions.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2" aria-label="Suggested tags">
          {suggestions.slice(0, 5).map((suggestion) => (
            <button
              className="min-h-10 rounded-full bg-surface-muted px-3 py-1 text-xs font-bold text-muted hover:bg-accent-soft hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35"
              key={suggestion.id}
              onClick={() => addTag(suggestion.name)}
              type="button"
            >
              #{suggestion.name.replace(/^#/, '')}
            </button>
          ))}
        </div>
      )}
      <p className="mt-1.5 text-xs text-muted">Press Enter to add a tag. Add up to 5 tags.</p>
    </div>
  );
}

export function AttachmentActions() {
  return (
    <div>
      <div aria-label="Attachments unavailable" className="grid gap-2 sm:grid-cols-3">
        {[
          { label: 'Image', icon: ImageIcon },
          { label: 'Audio', icon: Mic2 },
          { label: 'Document', icon: FileText },
        ].map(({ label, icon: Icon }) => (
          <button
            aria-disabled="true"
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-line bg-surface-muted px-3 text-sm font-extrabold text-muted opacity-75"
            disabled
            key={label}
            type="button"
          >
            <Icon aria-hidden="true" className="size-5" />
            {label}
            <LockKeyhole aria-hidden="true" className="size-3.5" />
          </button>
        ))}
      </div>
      <div className="mt-3">
        <StatusBanner tone="info">
          Attachments are not available yet. You can publish text discussions now.
        </StatusBanner>
      </div>
    </div>
  );
}

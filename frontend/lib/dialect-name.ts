'use client';

import { useMemo } from 'react';
import { useGetAllDialectsQuery } from '@/store/api';

/**
 * Resolves a dialect tag ("ig", "ha") to its admin-configured full name
 * ("Igbo", "Hausa") for display -- tags are the DB/API identifier, not
 * something a trainer or admin should have to read. Falls back to the
 * uppercased tag itself while the lookup is loading or if a tag has no
 * matching dialect (e.g. a stale/removed one), so callers never render
 * nothing.
 */
export function useDialectName(tag: string | null | undefined): string | null {
  const { data: dialects } = useGetAllDialectsQuery();
  const nameByTag = useMemo(() => {
    const map = new Map<string, string>();
    for (const dialect of dialects ?? []) map.set(dialect.tag.toLowerCase(), dialect.name);
    return map;
  }, [dialects]);

  if (!tag) return null;
  return nameByTag.get(tag.toLowerCase()) ?? tag.toUpperCase();
}

/** Non-hook variant for contexts that already have the full dialect list (e.g. a table rendering many rows) -- avoids one query subscription per row. */
export function resolveDialectName(tag: string | null | undefined, dialects: { tag: string; name: string }[] | undefined): string | null {
  if (!tag) return null;
  const match = dialects?.find((d) => d.tag.toLowerCase() === tag.toLowerCase());
  return match?.name ?? tag.toUpperCase();
}

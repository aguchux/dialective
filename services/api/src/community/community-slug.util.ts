import { randomUUID } from 'crypto';

/** Lowercase, hyphenated, ASCII-only slug base -- caller appends a uniqueness suffix if needed. */
export function slugifyBase(value: string, maxLength = 60): string {
  const base = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength);
  return base || 'item';
}

/** Slug with a short random suffix -- for content types (posts) where title collisions are common and a slug clash must never fail the write. */
export function slugifyUnique(value: string, maxLength = 60): string {
  return `${slugifyBase(value, maxLength)}-${randomUUID().slice(0, 8)}`;
}

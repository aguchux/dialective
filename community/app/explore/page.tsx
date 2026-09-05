'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { useListSpacesQuery, useSearchQuery } from '@/store/api';
import { Card, PageHeading, TextInput } from '@/components/ui';

export default function ExplorePage() {
  const [query, setQuery] = useState('');
  const { data: spaces } = useListSpacesQuery();
  const { data: results, isFetching } = useSearchQuery(query, { skip: query.trim().length < 2 });

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <PageHeading title="Explore" subtitle="Discover topics, spaces and popular discussions." />

      <div className="relative mb-6">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
        />
        <TextInput
          className="pl-9"
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search posts, tags, spaces, people..."
          value={query}
        />
      </div>

      {query.trim().length >= 2 ? (
        <div className="grid gap-4">
          {isFetching ? (
            <p className="py-8 text-center text-sm text-muted">Searching...</p>
          ) : (
            <>
              {(results?.posts.length ?? 0) > 0 && (
                <section>
                  <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">Posts</h2>
                  <div className="grid gap-2">
                    {results!.posts.map((p) => (
                      <Link href={`/post/${p.slug}`} key={p.id}>
                        <Card className="p-3.5 transition-colors hover:border-accent">
                          <p className="text-sm font-bold text-ink">{p.title}</p>
                        </Card>
                      </Link>
                    ))}
                  </div>
                </section>
              )}
              {(results?.spaces.length ?? 0) > 0 && (
                <section>
                  <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">Spaces</h2>
                  <div className="grid gap-2">
                    {results!.spaces.map((s) => (
                      <Link href={`/spaces/${s.slug}`} key={s.id}>
                        <Card className="p-3.5 transition-colors hover:border-accent">
                          <p className="text-sm font-bold text-ink">{s.name}</p>
                        </Card>
                      </Link>
                    ))}
                  </div>
                </section>
              )}
              {(results?.posts.length ?? 0) === 0 && (results?.spaces.length ?? 0) === 0 && (
                <p className="py-8 text-center text-sm text-muted">No results for &ldquo;{query}&rdquo;.</p>
              )}
            </>
          )}
        </div>
      ) : (
        <>
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-muted">Spaces</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {(spaces ?? []).map((space) => (
              <Link href={`/spaces/${space.slug}`} key={space.id}>
                <Card className="p-4 transition-colors hover:border-accent">
                  <p className="font-black text-ink">{space.name}</p>
                  {space.description && <p className="mt-1 text-sm text-muted">{space.description}</p>}
                </Card>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

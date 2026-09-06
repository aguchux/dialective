'use client';

import { useEffect } from 'react';

/**
 * Catches errors thrown by the root layout itself (app/layout.tsx or
 * anything it renders directly) -- app/error.tsx cannot catch those since it
 * lives inside the layout it would need to replace. Must render its own
 * <html>/<body> since the layout is exactly what may have failed.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <main style={{ display: 'grid', minHeight: '100vh', placeItems: 'center', padding: 20 }}>
          <section style={{ maxWidth: 420, textAlign: 'center' }}>
            <h1>Something went wrong</h1>
            <p>{error.message || 'An unexpected error occurred.'}</p>
            <button onClick={reset} type="button">
              Try again
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}

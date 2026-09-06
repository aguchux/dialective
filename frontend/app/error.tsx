'use client';

import { useEffect } from 'react';

/**
 * Segment error boundary for everything under the root layout. Without this,
 * Next.js's App Router unmounts the entire tree on any uncaught render/effect
 * exception and shows nothing -- no message, no retry, just a blank page.
 * This was the actual cause behind reports of "blank dashboard" and "blank
 * training dialog": some component threw, and there was nowhere for that
 * error to land.
 */
export default function GlobalErrorBoundary({
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
    <main className="grid min-h-screen place-items-center bg-bg p-5 text-ink">
      <section className="grid w-full max-w-md gap-4 rounded-lg border border-line bg-surface p-6 text-center shadow-[0_2px_8px_rgba(27,31,27,0.08)]">
        <h1 className="text-xl font-black">Something went wrong</h1>
        <p className="leading-relaxed text-muted">
          {error.message || 'An unexpected error occurred.'}
        </p>
        {error.digest && <p className="text-xs text-muted">Reference: {error.digest}</p>}
        <div className="flex justify-center gap-3">
          <button
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-accent px-4 font-extrabold text-white hover:bg-accent-dark"
            onClick={reset}
            type="button"
          >
            Try again
          </button>
          <button
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-line px-4 font-extrabold hover:bg-surface-muted"
            onClick={() => (window.location.href = '/')}
            type="button"
          >
            Go home
          </button>
        </div>
      </section>
    </main>
  );
}

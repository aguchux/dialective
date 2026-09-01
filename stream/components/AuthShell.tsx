import type { ReactNode } from 'react';
import { BrandLogo } from './BrandLogo';

const FEATURES = [
  { title: 'Secure & Compliant', body: 'Enterprise-grade security and data protection.' },
  { title: 'High Quality & Validated', body: 'Professionally recorded and rigorously validated.' },
  { title: 'Diverse Speakers', body: 'Real voices across dialects and regions.' },
  { title: 'Scalable Streaming', body: 'Stream or integrate via powerful APIs.' },
];

/**
 * Two-panel shell shared by login/register/accept-invite/reset-password:
 * a dark hero panel (product pitch, always dark regardless of the app's
 * light-mode default) beside a light panel holding the actual form. Mirrors
 * the dashboard's .stream-console dark palette for the left panel only.
 */
export function AuthShell({ eyebrow, children }: { eyebrow?: ReactNode; children: ReactNode }) {
  return (
    <div className="stream-console grid min-h-screen bg-bg lg:grid-cols-2">
      <div className="relative hidden overflow-hidden px-10 py-10 lg:flex lg:flex-col lg:justify-between">
        <HeroBackdrop />
        <div className="relative z-10">
          <BrandLogo className="text-white" href="" size={32} textClassName="text-lg" />
        </div>

        <div className="relative z-10 max-w-md">
          <h1 className="text-4xl font-black leading-tight text-white">
            License voice and
            <br />
            dialect data collected
            <br />
            by <span className="text-accent">real speakers.</span>
          </h1>
          <div className="mt-4 h-1 w-14 rounded-full bg-accent" />
          <p className="mt-4 text-lg text-white/70">Curated, validated voice datasets for AI teams.</p>
        </div>

        <div className="relative z-10 grid grid-cols-2 gap-6">
          {FEATURES.map((feature) => (
            <div className="flex items-start gap-3" key={feature.title}>
              <FeatureIcon title={feature.title} />
              <div>
                <p className="text-sm font-bold text-white">{feature.title}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-white/60">{feature.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="stream-console-light flex min-h-screen items-center justify-center bg-bg px-4 py-12">
        <div className="w-full max-w-md">
          <div className="mb-6 flex justify-center lg:hidden">
            <BrandLogo href="" size={32} textClassName="text-lg" />
          </div>
          {eyebrow && (
            <div className="mb-4 flex justify-center">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-bold text-muted">
                {eyebrow}
              </span>
            </div>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}

function HeroBackdrop() {
  const bars = Array.from({ length: 48 }, (_, i) => {
    const h = 8 + Math.abs(Math.sin(i * 0.7)) * 40 + Math.abs(Math.cos(i * 0.35)) * 20;
    return Math.round(h);
  });
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-40">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,_var(--color-accent-soft),_transparent_55%)]" />
      <svg
        className="absolute inset-x-0 bottom-24 h-40 w-full"
        preserveAspectRatio="none"
        viewBox="0 0 480 100"
      >
        {bars.map((h, i) => (
          <rect
            fill="var(--color-accent)"
            height={h}
            key={i}
            opacity={0.5 + (i % 5) * 0.1}
            width="4"
            x={i * 10}
            y={100 - h}
          />
        ))}
      </svg>
    </div>
  );
}

function FeatureIcon({ title }: { title: string }) {
  return (
    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
      <svg
        aria-hidden="true"
        className="size-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        viewBox="0 0 24 24"
      >
        {title === 'Secure & Compliant' && (
          <path
            d="M12 3l7 3v6c0 4.5-3 8-7 9-4-1-7-4.5-7-9V6l7-3Z"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
        {title === 'High Quality & Validated' && (
          <path d="M3 12h3l2-7 4 14 2-7h7" strokeLinecap="round" strokeLinejoin="round" />
        )}
        {title === 'Diverse Speakers' && (
          <>
            <circle cx="9" cy="8" r="3" />
            <path d="M2.5 20a6.5 6.5 0 0 1 13 0" strokeLinecap="round" />
            <path d="M15.5 5.5a3.25 3.25 0 0 1 0 6.4" strokeLinecap="round" />
            <path d="M17 14.2a6.5 6.5 0 0 1 4.5 5.8" strokeLinecap="round" />
          </>
        )}
        {title === 'Scalable Streaming' && (
          <path
            d="M6 18a4 4 0 0 1 0-8 5.5 5.5 0 0 1 10.7-1.6A4.5 4.5 0 0 1 17 18H6Z"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </svg>
    </span>
  );
}

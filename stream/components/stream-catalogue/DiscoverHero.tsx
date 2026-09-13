'use client';

import { ArrowUpRight, BarChart3, Play, Sparkles } from 'lucide-react';
import type { CatalogueMetric } from './types';
import { Waveform } from './primitives';

export function DiscoverHero({
  metrics,
  onHowItWorks,
  onExplore,
}: {
  metrics: CatalogueMetric[];
  onHowItWorks: () => void;
  onExplore: () => void;
}) {
  return (
    <section
      className="relative overflow-hidden rounded-[10px] border border-catalogue-blue/35 bg-[#241a34] bg-[url('/hero-banner.svg')] bg-cover bg-center p-3.5 shadow-catalogue sm:p-4"
      id="home"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(100deg,rgba(26,20,36,0.55)_0%,rgba(26,20,36,0.15)_55%,rgba(26,20,36,0.55)_100%)]"
      />
      <div className="relative z-10 grid gap-5 xl:grid-cols-[minmax(340px,0.9fr)_minmax(420px,1.1fr)] xl:items-center">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 rounded-full border border-catalogue-blue/35 bg-catalogue-blue/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-catalogue-blue-bright">
            <Sparkles aria-hidden="true" className="size-3" />
            Built for AI teams
          </div>
          <h1 className="mt-3 text-[clamp(1.05rem,1.7vw,1.75rem)] font-extrabold leading-tight tracking-[-0.03em] text-catalogue-ink xl:whitespace-nowrap">
            Discover Real Voice Datasets
          </h1>
          <p className="mt-2 max-w-[390px] text-sm leading-relaxed text-catalogue-muted">
            License high-quality voice and dialect data collected by real speakers. Built for AI.
          </p>
          <div className="mt-4 flex flex-wrap gap-2.5">
            <button
              className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-catalogue-blue px-4 text-xs font-bold text-white transition-colors hover:bg-catalogue-blue-bright focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-catalogue-blue-bright/60"
              onClick={onExplore}
              type="button"
            >
              Explore Voice Library <ArrowUpRight aria-hidden="true" className="size-3.5" />
            </button>
            <button
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-catalogue-line-strong bg-catalogue-surface/60 px-4 text-xs font-bold text-catalogue-ink transition-colors hover:bg-catalogue-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-catalogue-blue-bright/60"
              onClick={onHowItWorks}
              type="button"
            >
              <span className="grid size-5 place-items-center rounded-full border border-catalogue-muted/60">
                <Play aria-hidden="true" className="size-2.5" fill="currentColor" />
              </span>
              How It Works
            </button>
          </div>
        </div>

        <div className="grid gap-2.5 sm:grid-cols-3">
          {metrics.map((metric) => (
            <div
              className="rounded-lg border border-white/10 bg-[#231a33]/75 p-3 backdrop-blur-sm"
              key={metric.label}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="grid size-6 place-items-center rounded-md bg-catalogue-blue-soft text-catalogue-blue-bright">
                  <BarChart3 aria-hidden="true" className="size-3" />
                </span>
                <span className="text-[10px] font-semibold text-catalogue-green">
                  ↗ {metric.delta}
                </span>
              </div>
              <p className="mt-2.5 text-[10px] font-semibold uppercase tracking-wide text-catalogue-dim">
                {metric.label}
              </p>
              <p className="mt-1 text-xl font-semibold tracking-tight text-catalogue-ink">
                {metric.value}
              </p>
              <div className="mt-2.5 h-5 opacity-80">
                <Waveform bars={metric.trend} className="text-catalogue-blue" progress={0.6} />
              </div>
              <p className="mt-1 text-[9px] text-catalogue-dim">vs last 30 days</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

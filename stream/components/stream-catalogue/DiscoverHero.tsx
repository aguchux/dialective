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
      className="relative overflow-hidden rounded-[10px] border border-catalogue-blue/35 bg-[linear-gradient(115deg,#33244a_0%,#241a34_48%,#1a1424_100%)] p-4 shadow-catalogue sm:p-5"
      id="home"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-40 [background-image:radial-gradient(circle_at_74%_32%,rgba(168,102,224,0.35),transparent_34%),linear-gradient(rgba(168,102,224,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(168,102,224,0.12)_1px,transparent_1px)] [background-size:auto,42px_42px,42px_42px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-6 bottom-4 h-32 w-[48%] opacity-60 sm:h-40"
      >
        <svg className="h-full w-full" preserveAspectRatio="none" viewBox="0 0 400 120">
          <path
            d="M0 82 C20 57 28 112 47 74 S75 72 91 53 S121 103 139 66 S168 76 184 43 S213 88 232 72 S258 30 276 61 S299 101 321 57 S348 77 400 37"
            fill="none"
            stroke="#c08bef"
            strokeLinecap="round"
            strokeWidth="2"
          />
          <path
            d="M0 91 C20 76 30 108 50 88 S78 68 95 78 S125 93 145 74 S170 80 190 62 S215 102 235 80 S265 53 282 71 S306 92 327 76 S353 78 400 55"
            fill="none"
            stroke="#a866e0"
            strokeOpacity="0.45"
            strokeWidth="1"
          />
        </svg>
      </div>
      <div className="relative z-10 grid gap-6 lg:grid-cols-[minmax(0,0.92fr)_minmax(480px,1.08fr)] lg:items-center">
        <div className="max-w-[440px]">
          <div className="inline-flex items-center gap-2 rounded-full border border-catalogue-blue/35 bg-catalogue-blue/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-catalogue-blue-bright">
            <Sparkles aria-hidden="true" className="size-3" />
            Built for AI teams
          </div>
          <h1 className="mt-4 text-[clamp(1.75rem,3vw,2.5rem)] font-extrabold leading-tight tracking-[-0.04em] text-catalogue-ink">
            Discover Real Voice Datasets
          </h1>
          <p className="mt-2 max-w-[390px] text-sm leading-relaxed text-catalogue-muted">
            License high-quality voice and dialect data collected by real speakers. Built for AI.
          </p>
          <div className="mt-5 flex flex-wrap gap-2.5">
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
              className="rounded-lg border border-white/10 bg-[#231a33]/75 p-3.5 backdrop-blur-sm"
              key={metric.label}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="grid size-7 place-items-center rounded-md bg-catalogue-blue-soft text-catalogue-blue-bright">
                  <BarChart3 aria-hidden="true" className="size-3.5" />
                </span>
                <span className="text-[10px] font-semibold text-catalogue-green">
                  ↗ {metric.delta}
                </span>
              </div>
              <p className="mt-3 text-[10px] font-semibold uppercase tracking-wide text-catalogue-dim">
                {metric.label}
              </p>
              <p className="mt-1 text-2xl font-semibold tracking-tight text-catalogue-ink">
                {metric.value}
              </p>
              <div className="mt-3 h-6 opacity-80">
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

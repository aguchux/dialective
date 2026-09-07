import type { ReactNode } from 'react';
import { AudioWaveform, Cloud, ShieldCheck, UsersRound } from 'lucide-react';
import { BrandLogo } from './BrandLogo';

const FEATURES = [
  {
    title: 'Secure & Compliant',
    body: 'Enterprise-grade security and data protection.',
    icon: ShieldCheck,
  },
  {
    title: 'High Quality & Validated',
    body: 'Professionally recorded and rigorously validated.',
    icon: AudioWaveform,
  },
  {
    title: 'Diverse Speakers',
    body: 'Real voices across dialects and regions.',
    icon: UsersRound,
  },
  {
    title: 'Scalable Streaming',
    body: 'Stream or integrate via powerful APIs.',
    icon: Cloud,
  },
];

const WAVEFORM = [
  10, 22, 16, 38, 20, 52, 28, 17, 43, 24, 66, 30, 18, 48, 76, 38, 24, 54, 32, 18, 46, 25, 62, 34,
  19, 44, 27, 70, 40, 22, 51, 30, 17, 44, 64, 32, 20, 58, 36, 19, 48, 27, 54, 34, 18, 42, 24, 58,
  30, 16, 38, 22, 46, 28, 18, 34, 20, 44, 26, 16,
];

export function AuthShell({ eyebrow, children }: { eyebrow?: ReactNode; children: ReactNode }) {
  return (
    <main className="stream-auth min-h-screen bg-auth-frame p-0 lg:p-2">
      <div className="grid min-h-[100svh] overflow-hidden bg-auth-hero lg:min-h-[calc(100svh-1rem)] lg:grid-cols-[1.56fr_1fr] lg:rounded-[22px]">
        <section className="relative hidden min-h-full overflow-hidden bg-auth-hero-deep px-8 py-8 lg:flex lg:flex-col lg:px-11 lg:py-10">
          <HeroAtmosphere />
          <div className="relative z-10 flex items-start">
            <BrandLogo
              className="text-white"
              href=""
              mode="stacked"
              size={46}
              textClassName="text-white"
            />
          </div>

          <div className="relative z-10 mt-16 max-w-[540px] flex-1 pb-12 pt-4 xl:mt-24 xl:pb-20">
            <p className="mb-5 text-xs font-bold uppercase tracking-[0.28em] text-white/45">
              Dialect Library Voice Stream
            </p>
            <h1 className="max-w-[560px] text-[clamp(2.75rem,3.6vw,4rem)] font-extrabold leading-[1.05] tracking-[-0.045em] text-white">
              License voice and
              <br />
              dialect data collected
              <br />
              by <span className="text-auth-accent">real speakers.</span>
            </h1>
            <div className="mt-6 h-1 w-16 rounded-full bg-auth-accent" />
            <p className="mt-5 max-w-[390px] text-lg leading-relaxed text-white/70">
              Curated, validated voice datasets for AI teams.
            </p>
          </div>

          <HeroDataCard />
          <FeatureStrip />
        </section>

        <section className="stream-auth-panel flex min-h-[100svh] min-w-0 flex-col overflow-y-auto px-4 py-8 sm:px-8 sm:py-10 lg:min-h-full lg:px-10 lg:py-12">
          <div className="mx-auto flex w-full max-w-[468px] flex-1 flex-col justify-center">
            <div className="mb-8 flex justify-center lg:hidden">
              <BrandLogo
                className="text-auth-ink"
                href=""
                mode="stacked"
                size={42}
                textClassName="text-auth-ink"
              />
            </div>
            {eyebrow && (
              <div className="mb-5 flex justify-center">
                <span className="inline-flex min-h-10 items-center gap-2 rounded-full border border-auth-line bg-auth-card px-4 py-2 text-[13px] font-semibold text-auth-accent shadow-[0_2px_8px_rgba(8,20,44,0.03)]">
                  {eyebrow}
                </span>
              </div>
            )}
            {children}
          </div>
        </section>
      </div>
    </main>
  );
}

function HeroAtmosphere() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_16%,rgba(22,88,192,0.34),transparent_38%),radial-gradient(circle_at_78%_42%,rgba(12,99,243,0.18),transparent_36%),linear-gradient(145deg,#06152f_0%,#031027_72%)]" />
      <div className="absolute inset-0 opacity-25 [background-image:linear-gradient(rgba(74,135,255,0.2)_1px,transparent_1px),linear-gradient(90deg,rgba(74,135,255,0.2)_1px,transparent_1px)] [background-size:54px_54px] [mask-image:linear-gradient(to_bottom,black,transparent_72%)]" />
      <div className="absolute right-[-9%] top-[16%] h-[50%] w-[62%] overflow-hidden rounded-[34px] opacity-60 mix-blend-screen">
        <img
          alt="A group of people recording audio in a studio; photo by cottonbro studio on Pexels."
          className="h-full w-full object-cover object-center grayscale-[15%]"
          height={800}
          loading="eager"
          src="https://images.pexels.com/photos/6878694/pexels-photo-6878694.jpeg"
          style={{ height: '100%', width: '100%' }}
          width={1200}
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,#031027_0%,rgba(3,16,39,0.08)_42%,rgba(3,16,39,0.42)_100%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(3,16,39,0.12),#031027_100%)]" />
      </div>
      <div className="absolute inset-x-0 bottom-[25%] h-48 opacity-70">
        <svg className="h-full w-full" preserveAspectRatio="none" viewBox="0 0 600 120">
          <defs>
            <linearGradient id="stream-auth-wave" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0" stopColor="#0d63f3" stopOpacity="0" />
              <stop offset="0.25" stopColor="#0d63f3" stopOpacity="0.9" />
              <stop offset="0.78" stopColor="#4d96ff" stopOpacity="0.9" />
              <stop offset="1" stopColor="#4d96ff" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            d="M0 72 C24 67 24 77 48 72 S72 47 96 72 S120 91 144 72 S168 26 192 72 S216 101 240 72 S264 46 288 72 S312 14 336 72 S360 105 384 72 S408 31 432 72 S456 88 480 72 S504 49 528 72 S552 66 600 72"
            fill="none"
            stroke="url(#stream-auth-wave)"
            strokeWidth="2.5"
          />
          {WAVEFORM.map((height, index) => (
            <rect
              fill="#2f7fff"
              height={height}
              key={index}
              opacity={0.24 + (index % 5) * 0.11}
              rx="2"
              width="2"
              x={index * 10}
              y={60 - height / 2}
            />
          ))}
        </svg>
      </div>
      <div className="absolute inset-x-0 bottom-0 h-[45%] bg-[linear-gradient(to_top,#031027,transparent)]" />
    </div>
  );
}

function HeroDataCard() {
  return (
    <div
      aria-hidden="true"
      className="absolute bottom-[17%] right-8 z-10 hidden w-[270px] rounded-xl border border-white/20 bg-[#0d2349]/85 p-4 shadow-[0_18px_42px_rgba(0,0,0,0.3)] backdrop-blur-md xl:block"
    >
      <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid size-6 place-items-center rounded-md bg-auth-accent/20 text-auth-accent">
            <AudioWaveform className="size-3.5" />
          </span>
          <span className="truncate text-[11px] font-bold text-white">Licensed voice dataset</span>
        </div>
        <span className="rounded-full bg-emerald-400/15 px-2 py-1 text-[9px] font-bold text-emerald-300">
          Verified
        </span>
      </div>
      <div className="grid grid-cols-3 gap-3 py-3 text-[9px] text-white/50">
        <div>
          <p>Language</p>
          <p className="mt-1 font-bold text-white">English (UK)</p>
        </div>
        <div>
          <p>Speakers</p>
          <p className="mt-1 font-bold text-white">1,250+</p>
        </div>
        <div>
          <p>Hours</p>
          <p className="mt-1 font-bold text-white">32.5+</p>
        </div>
      </div>
      <div className="grid gap-2">
        {['Accent variety', 'Recording quality', 'Metadata richness'].map((label, index) => (
          <div className="grid grid-cols-[86px_1fr] items-center gap-2" key={label}>
            <span className="text-[9px] text-white/50">{label}</span>
            <span className="h-1.5 overflow-hidden rounded-full bg-white/10">
              <span
                className="block h-full rounded-full bg-auth-accent"
                style={{ width: `${72 + index * 8}%` }}
              />
            </span>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-[10px] font-bold text-white/80">
        <ShieldCheck className="size-3.5 text-auth-accent" />
        Enterprise ready
      </div>
    </div>
  );
}

function FeatureStrip() {
  return (
    <div className="relative z-10 grid grid-cols-2 gap-x-6 gap-y-6 border-t border-white/15 pt-6 xl:grid-cols-4 xl:gap-0">
      {FEATURES.map((feature, index) => {
        const Icon = feature.icon;
        return (
          <div
            className={`flex items-start gap-3 ${index % 2 === 1 ? 'border-l border-white/10 pl-5' : ''} xl:border-l xl:border-white/10 xl:pl-5 xl:first:border-l-0 xl:first:pl-0`}
            key={feature.title}
          >
            <Icon
              aria-hidden="true"
              className="mt-0.5 size-7 shrink-0 text-auth-accent"
              strokeWidth={1.8}
            />
            <div className="min-w-0">
              <p className="text-xs font-bold leading-snug text-white">{feature.title}</p>
              <p className="mt-1 text-[10px] leading-relaxed text-white/55">{feature.body}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

import type { ReactNode } from 'react';
import Image from 'next/image';
import { BrandLogo } from './BrandLogo';

const WAVEFORM = [
  10, 22, 16, 38, 20, 52, 28, 17, 43, 24, 66, 30, 18, 48, 76, 38, 24, 54, 32, 18, 46, 25, 62, 34,
  19, 44, 27, 70, 40, 22, 51, 30, 17, 44, 64, 32, 20, 58, 36, 19, 48, 27, 54, 34, 18, 42, 24, 58,
  30, 16, 38, 22, 46, 28, 18, 34, 20, 44, 26, 16,
];

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="stream-catalogue min-h-[100svh] w-full max-w-[100vw] overflow-x-hidden bg-catalogue-bg p-0 lg:h-[100svh] lg:p-2">
      <div className="grid min-h-[100svh] w-full min-w-0 max-w-full overflow-hidden bg-catalogue-bg lg:h-full lg:min-h-0 lg:grid-cols-[1.56fr_1fr] lg:rounded-[22px]">
        <section className="relative hidden min-h-0 overflow-hidden bg-catalogue-bg px-8 py-8 lg:flex lg:h-full lg:flex-col lg:px-11 lg:py-10">
          <HeroAtmosphere />
          <div className="relative z-10 flex items-start">
            <BrandLogo href="" mode="catalogue" size={46} textClassName="text-catalogue-ink" />
          </div>

          <div className="relative z-10 mt-16 flex flex-1 items-center pb-16 pt-4 xl:mt-12 xl:pb-20">
            <div className="max-w-[540px]">
              <p className="mb-5 text-xs font-bold uppercase tracking-[0.28em] text-catalogue-dim">
                Dialect Library Voice Stream
              </p>
              <h1 className="max-w-[560px] text-[clamp(2.75rem,3.6vw,4rem)] font-extrabold leading-[1.05] tracking-[-0.045em] text-catalogue-ink">
                License voice and
                <br />
                dialect data collected
                <br />
                by <span className="text-catalogue-blue-bright">real speakers.</span>
              </h1>
              <div className="mt-6 h-1 w-16 rounded-full bg-catalogue-blue" />
              <p className="mt-5 max-w-[390px] text-lg leading-relaxed text-catalogue-muted">
                Curated, validated voice datasets for AI teams.
              </p>
            </div>
          </div>
        </section>

        <section className="stream-catalogue-auth-panel flex min-h-[100svh] w-full min-w-0 max-w-full flex-col overflow-x-hidden overflow-y-auto overscroll-contain px-4 py-8 sm:px-8 sm:py-10 lg:min-h-0 lg:px-10 lg:py-8">
          <div className="mx-auto flex min-h-full w-full min-w-0 max-w-[468px] flex-col justify-center">
            <div className="mb-7 flex justify-center lg:hidden">
              <BrandLogo href="" mode="catalogue" size={42} textClassName="text-catalogue-ink" />
            </div>
            {children}
          </div>
        </section>
      </div>
    </main>
  );
}

function HeroAtmosphere() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <Image
        alt="A group of people recording audio in a studio; photo by cottonbro studio on Pexels."
        className="object-cover object-center grayscale-[15%]"
        fill
        priority
        sizes="(max-width: 1023px) 0px, 62vw"
        src="https://images.pexels.com/photos/6878694/pexels-photo-6878694.jpeg"
      />
      {/* Scrim over the full-bleed photo so the logo/heading/copy stay
          legible -- darkest at the edges (where text sits), lighter toward
          center so the photo itself still reads through. */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_16%,rgba(168,102,224,0.30),transparent_38%),radial-gradient(circle_at_78%_42%,rgba(192,139,239,0.14),transparent_36%)] mix-blend-screen" />
      <div className="absolute inset-0 bg-[linear-gradient(100deg,#15111c_0%,rgba(21,17,28,0.62)_28%,rgba(21,17,28,0.34)_55%,rgba(21,17,28,0.58)_78%,#15111c_100%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(21,17,28,0.55)_0%,rgba(21,17,28,0.15)_30%,rgba(21,17,28,0.25)_60%,#15111c_100%)]" />
      <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(168,102,224,0.18)_1px,transparent_1px),linear-gradient(90deg,rgba(168,102,224,0.18)_1px,transparent_1px)] [background-size:54px_54px] [mask-image:linear-gradient(to_bottom,black,transparent_72%)]" />
      <div className="absolute inset-x-0 bottom-[25%] h-48 opacity-70">
        <svg className="h-full w-full" preserveAspectRatio="none" viewBox="0 0 600 120">
          <defs>
            <linearGradient id="stream-auth-wave" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0" stopColor="#a866e0" stopOpacity="0" />
              <stop offset="0.25" stopColor="#a866e0" stopOpacity="0.9" />
              <stop offset="0.78" stopColor="#c08bef" stopOpacity="0.9" />
              <stop offset="1" stopColor="#c08bef" stopOpacity="0" />
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
              fill="#a866e0"
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
      <div className="absolute inset-x-0 bottom-0 h-[45%] bg-[linear-gradient(to_top,#15111c,transparent)]" />
    </div>
  );
}

import Link from 'next/link';
import { ParallaxTopBackground } from '@/components/ParallaxTopBackground';
import { BrandLogo } from '@/components/BrandLogo';

export function AuthPage({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative isolate grid min-h-screen place-content-center overflow-hidden bg-bg px-4 py-5">
      <ParallaxTopBackground />
      <div className="relative z-10 mx-auto grid w-full min-w-[320px] max-w-95 gap-4">
        <Link
          className="inline-flex items-center gap-1.5 justify-self-start text-sm font-bold text-muted no-underline transition-colors hover:text-ink"
          href="/"
        >
          <span aria-hidden="true">&larr;</span> Back to home
        </Link>
        {children}
      </div>
    </main>
  );
}

export function AuthPanel({ children }: { children: React.ReactNode }) {
  return (
    <section className="grid min-h-115 gap-4 rounded-lg border border-line bg-surface p-6 shadow-[0_12px_28px_rgba(27,31,27,0.07)] md:p-8">
      <BrandLogo
        href="/"
        size={36}
        className="justify-self-center text-accent"
        textClassName="text-sm"
      />
      {children}
    </section>
  );
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-sm font-extrabold uppercase tracking-normal text-accent">{children}</div>
  );
}

export function Notice({ children }: { children: React.ReactNode }) {
  return <p className="leading-relaxed text-muted">{children}</p>;
}

export function Alert({ children }: { children: React.ReactNode }) {
  return (
    <p className="leading-relaxed text-danger" role="alert">
      {children}
    </p>
  );
}

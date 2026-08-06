import { ParallaxTopBackground } from '@/components/ParallaxTopBackground';

export function AuthPage({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative isolate grid min-h-screen place-content-center overflow-hidden bg-bg px-4 py-5">
      <ParallaxTopBackground />
      <div className="relative z-10 mx-auto grid w-full max-w-95 gap-4">{children}</div>
    </main>
  );
}

export function AuthPanel({ children }: { children: React.ReactNode }) {
  return (
    <section className="grid gap-3 rounded-lg border border-line bg-surface p-4 shadow-[0_12px_28px_rgba(27,31,27,0.07)]">
      {children}
    </section>
  );
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="text-sm font-extrabold uppercase tracking-normal text-accent">{children}</p>;
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

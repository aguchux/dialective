export function AuthPage({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto grid min-h-screen max-w-95 place-content-center gap-4 px-4 py-5">{children}</main>;
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

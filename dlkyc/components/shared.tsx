/** Mirrors frontend/components/dashboard/shared.tsx's cardClass/SectionTitle -- kept minimal since this app needs only these two. */
export const cardClass =
  'min-w-0 rounded-lg border border-line bg-surface shadow-[0_8px_24px_rgba(31,25,41,0.04)]';

export function SectionTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-3">
      <h3 className="text-lg font-black md:text-xl">{title}</h3>
      <p className="mt-0.5 text-sm text-muted">{subtitle}</p>
    </div>
  );
}

export const primaryButtonClass =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-accent bg-accent px-5 font-extrabold text-white transition-colors hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60';

export const secondaryButtonClass =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line px-5 font-extrabold text-ink transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60';

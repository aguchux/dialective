import { Construction } from 'lucide-react';

export function PagePlaceholder({ note }: { note?: string }) {
  return (
    <div className="grid min-h-[50vh] place-items-center rounded-[10px] border border-dashed border-catalogue-line-strong bg-catalogue-surface/60 p-10 text-center">
      <div>
        <Construction aria-hidden="true" className="mx-auto size-8 text-catalogue-dim" />
        <p className="mt-3 text-sm font-semibold text-catalogue-ink">Page scaffolded</p>
        <p className="mt-1 max-w-sm text-xs leading-relaxed text-catalogue-muted">
          {note ?? 'This route is wired up and themed -- content is coming next.'}
        </p>
      </div>
    </div>
  );
}

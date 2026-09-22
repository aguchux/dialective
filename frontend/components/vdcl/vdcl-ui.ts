/**
 * Shared button/styling classes for the VDCL surfaces.
 *
 * ActionButton carries no visual styling of its own -- every caller in this
 * codebase supplies it -- so these exist so the maker, the sign panel and
 * the documents panel cannot drift into three different-looking primary
 * buttons on what is one flow.
 */
export const primaryButton =
  'min-h-11 rounded-lg bg-accent px-5 font-extrabold text-white transition-colors hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-50';

export const secondaryButton =
  'min-h-11 rounded-lg border border-line bg-surface px-4 font-extrabold text-ink transition-colors hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50';

export const fieldClass =
  'min-h-11 w-full rounded-lg border border-line bg-surface px-3 text-ink outline-none transition-colors placeholder:text-muted focus:border-accent';

/**
 * Status tones, taken from the theme tokens rather than raw Tailwind
 * palette colours. The raw ones (bg-red-50, text-emerald-700) do not
 * respond to the dashboard's dark theme, so they render as bright blocks on
 * a dark surface.
 */
export const alertTone = {
  danger: 'border border-danger/30 bg-danger/10 text-danger',
  warning: 'border border-warning/30 bg-warning/10 text-warning',
  success: 'border border-accent/30 bg-accent-soft text-accent',
  neutral: 'border border-line bg-surface-muted text-muted',
} as const;

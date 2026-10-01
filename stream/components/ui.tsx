import type {
  ButtonHTMLAttributes,
  ComponentType,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from 'react';
import Link from 'next/link';

// Matches frontend/components/dashboard/shared.tsx's cardClass exactly so
// Stream's cards read as the same component family as the trainer
// dashboard's, not a visually distinct product.
export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`stream-card min-w-0 rounded-lg border border-line bg-surface shadow-[0_8px_24px_rgba(31,25,41,0.04)] ${className}`}
    >
      {children}
    </div>
  );
}

/**
 * `w-full` is the right default for a field in a stacked form, but it is
 * wrong for one sitting in a row of buttons. It cannot simply be appended
 * ahead of the caller's class: `w-full` and a caller's `w-36` are both
 * width utilities in the same Tailwind layer, so which one wins is decided
 * by their order in the generated stylesheet, not by their order in the
 * class string -- `w-full` won, and a select in the catalogue's action
 * column stretched until it pushed "Add to deck" off the row.
 *
 * So the default is applied only when the caller has not asked for a width.
 */
function widthClass(className: string): string {
  return /(^|\s)(w-|min-w-|max-w-|flex-1|grow|basis-)/.test(className) ? '' : 'w-full';
}

export function PrimaryButton({
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`inline-flex min-h-9 items-center justify-center gap-2 rounded-lg bg-accent px-3.5 text-sm font-semibold text-white transition-colors hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
      {...props}
    />
  );
}

export function SecondaryButton({
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-line bg-surface px-3.5 text-sm font-semibold text-ink transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
      {...props}
    />
  );
}

export function TextInput({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`min-h-9 ${widthClass(className)} rounded-lg border border-line bg-surface px-2.5 text-sm text-ink outline-none transition-colors placeholder:text-muted/70 focus:border-accent ${className}`}
      {...props}
    />
  );
}

/**
 * The themed counterpart to TextInput.
 *
 * Every page used to hand-roll its own `<select className="... bg-white">`.
 * `bg-white` is a literal, not a theme token, so it ignored the
 * .stream-console / .stream-catalogue re-points entirely and rendered a
 * white box with near-invisible white-on-white option text on the dark
 * console -- the single most visible theming break in the app. Routing
 * every select through here means the dark scopes reach it like any other
 * control.
 *
 * `bg-surface` also has to be restated on `<option>` (via the caller's
 * markup it cannot be, so it is set here): some browsers render the
 * dropdown list from the control's own background rather than inheriting
 * the page's color-scheme.
 */
export function SelectInput({
  className = '',
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`stream-select min-h-9 ${widthClass(className)} appearance-none rounded-lg border border-line bg-surface py-1.5 pr-7 pl-2.5 text-sm text-ink outline-none transition-colors focus:border-accent disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
      {...props}
    />
  );
}

export function FieldLabel({
  children,
  className = '',
  htmlFor,
}: {
  children: ReactNode;
  className?: string;
  htmlFor?: string;
}) {
  return (
    <label
      className={`mb-1 block text-[11px] font-bold uppercase tracking-wide text-muted ${className}`}
      htmlFor={htmlFor}
    >
      {children}
    </label>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  return (
    <p className="text-sm font-semibold text-danger" role="alert">
      {children}
    </p>
  );
}

export function PageHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-4">
      <h1 className="text-xl font-black tracking-tight text-ink">{title}</h1>
      {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
    </div>
  );
}

const METRIC_TONES = {
  accent: 'bg-accent-soft text-accent',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  danger: 'bg-danger/10 text-danger',
} as const;

/**
 * Compact stat tile matching the trainer dashboard's MetricCard
 * (frontend/components/trainer/TrainerDashboard.tsx) -- icon chip + label +
 * value, rather than Stream's earlier plain label-over-value Card. Ports
 * the pattern exactly (min-h-32, p-4/md:p-5, size-10 icon chip) so Stream's
 * dashboard reads as the same component family, not a separate product.
 */
export function MetricCard({
  icon: Icon,
  label,
  value,
  subValue,
  tone = 'accent',
  href,
}: {
  icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>;
  label: string;
  value: ReactNode;
  subValue?: ReactNode;
  tone?: keyof typeof METRIC_TONES;
  href?: string;
}) {
  const Content = href ? Link : 'div';
  return (
    <Card className="flex min-h-24 items-start gap-3 p-3.5">
      <Content
        className={`flex min-w-0 flex-1 items-start gap-3 ${href ? 'transition-colors hover:opacity-80' : ''}`}
        href={href as never}
      >
        <span
          className={`grid size-10 shrink-0 place-items-center rounded-lg ${METRIC_TONES[tone]}`}
        >
          <Icon aria-hidden="true" className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-muted">{label}</p>
          <p className="mt-1 wrap-break-word text-xl font-black leading-tight text-ink">{value}</p>
          {subValue && <p className="mt-1 text-xs font-bold text-muted">{subValue}</p>}
        </div>
      </Content>
    </Card>
  );
}

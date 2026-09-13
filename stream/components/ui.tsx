import type { ButtonHTMLAttributes, ComponentType, InputHTMLAttributes, ReactNode } from 'react';
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

export function PrimaryButton({
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
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
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-line bg-surface px-4 py-2.5 text-sm font-bold text-ink transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
      {...props}
    />
  );
}

export function TextInput({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`min-h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink outline-none transition-colors focus:border-accent ${className}`}
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
      className={`mb-1.5 block text-xs font-bold uppercase tracking-wide text-muted ${className}`}
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
    <div className="mb-6">
      <h1 className="text-2xl font-black tracking-tight text-ink">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
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
    <Card className="flex min-h-32 items-start gap-3 p-4 md:p-5">
      <Content
        className={`flex min-w-0 flex-1 items-start gap-3 ${href ? 'transition-colors hover:opacity-80' : ''}`}
        href={href as never}
      >
        <span className={`grid size-10 shrink-0 place-items-center rounded-lg ${METRIC_TONES[tone]}`}>
          <Icon aria-hidden="true" className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-muted">{label}</p>
          <p className="mt-2 wrap-break-word text-2xl font-black leading-tight text-ink">{value}</p>
          {subValue && <p className="mt-1 text-xs font-bold text-muted">{subValue}</p>}
        </div>
      </Content>
    </Card>
  );
}

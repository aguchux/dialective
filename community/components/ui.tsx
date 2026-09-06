import {
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { AlertCircle, Inbox, LoaderCircle } from 'lucide-react';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`min-w-0 rounded-lg border border-line bg-surface shadow-community-card ${className}`}
    >
      {children}
    </div>
  );
}

interface ActionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  pending?: boolean;
  pendingLabel?: ReactNode;
}

export function PrimaryButton({
  className = '',
  pending = false,
  pendingLabel = 'Working…',
  children,
  disabled,
  ...props
}: ActionButtonProps) {
  return (
    <button
      aria-busy={pending}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-accent bg-accent px-4 py-2.5 text-sm font-extrabold text-white transition-colors hover:bg-accent-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
      disabled={disabled || pending}
      {...props}
    >
      {pending ? (
        <>
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          {pendingLabel}
        </>
      ) : (
        children
      )}
    </button>
  );
}

export function SecondaryButton({
  className = '',
  pending = false,
  pendingLabel = 'Working…',
  children,
  disabled,
  ...props
}: ActionButtonProps) {
  return (
    <button
      aria-busy={pending}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line bg-surface px-4 py-2.5 text-sm font-extrabold text-ink transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
      disabled={disabled || pending}
      {...props}
    >
      {pending ? (
        <>
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          {pendingLabel}
        </>
      ) : (
        children
      )}
    </button>
  );
}

export function IconButton({
  label,
  className = '',
  children,
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      aria-label={label}
      className={`inline-flex size-11 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 ${className}`}
      title={label}
      type={type}
      {...props}
    >
      {children}
    </button>
  );
}

export function TextInput({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`min-h-11 w-full rounded-lg border border-line bg-surface px-3.5 text-base text-ink transition-colors placeholder:text-muted/75 focus:border-accent focus:ring-2 focus:ring-accent/15 focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 ${className}`}
      {...props}
    />
  );
}

export function TextArea({
  className = '',
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={`w-full rounded-lg border border-line bg-surface px-3.5 py-3 text-base text-ink transition-colors placeholder:text-muted/75 focus:border-accent focus:ring-2 focus:ring-accent/15 focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 ${className}`}
      {...props}
    />
  );
}

export function Select({ className = '', ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`min-h-11 w-full rounded-lg border border-line bg-surface px-3.5 text-base text-ink transition-colors focus:border-accent focus:ring-2 focus:ring-accent/15 focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 ${className}`}
      {...props}
    />
  );
}

export function FieldLabel({
  children,
  htmlFor,
  required = false,
}: {
  children: ReactNode;
  htmlFor?: string;
  required?: boolean;
}) {
  return (
    <label className="mb-1.5 block text-sm font-extrabold text-ink" htmlFor={htmlFor}>
      {children}
      {required && <span className="ml-1 text-danger">*</span>}
    </label>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  return (
    <p
      className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-danger"
      role="alert"
    >
      <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

export function StatusBanner({
  children,
  tone = 'success',
}: {
  children: ReactNode;
  tone?: 'success' | 'info' | 'warning' | 'danger';
}) {
  const tones = {
    success: 'border-success/25 bg-success-soft text-success',
    info: 'border-info/25 bg-info-soft text-info',
    warning: 'border-warning/25 bg-amber-50 text-warning',
    danger: 'border-danger/25 bg-red-50 text-danger',
  };
  return (
    <p
      className={`rounded-lg border px-3 py-2 text-sm font-bold ${tones[tone]}`}
      role={tone === 'danger' ? 'alert' : 'status'}
    >
      {children}
    </p>
  );
}

export function PageFrame({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`mx-auto w-full max-w-6xl px-4 py-7 sm:px-6 lg:px-8 lg:py-8 ${className}`}>
      {children}
    </div>
  );
}

export function PageHeading({
  title,
  subtitle,
  action,
  icon,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
      <div className="flex min-w-0 items-start gap-3">
        {icon && (
          <span className="hidden size-11 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent sm:grid">
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <h1 className="text-[28px] font-black tracking-tight text-ink sm:text-3xl lg:text-[34px]">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-1 max-w-2xl text-base leading-relaxed text-muted sm:text-lg">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {action && <div className="w-full shrink-0 sm:w-auto">{action}</div>}
    </div>
  );
}

export function Badge({
  children,
  tone = 'accent',
  className = '',
}: {
  children: ReactNode;
  tone?: 'accent' | 'muted' | 'success' | 'info' | 'warning' | 'danger';
  className?: string;
}) {
  const tones = {
    accent: 'bg-accent-soft text-accent-dark',
    muted: 'bg-surface-muted text-muted',
    success: 'bg-success-soft text-success',
    info: 'bg-info-soft text-info',
    warning: 'bg-amber-50 text-warning',
    danger: 'bg-red-50 text-danger',
  };

  return (
    <span
      className={`inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

export function SegmentedTabs<T extends string>({
  items,
  value,
  onChange,
  className = '',
  ariaLabel = 'Page sections',
}: {
  items: { key: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  ariaLabel?: string;
}) {
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const direction = event.key === 'ArrowRight' ? 1 : -1;
    const nextIndex = (index + direction + items.length) % items.length;
    const nextItem = items[nextIndex];
    buttonRefs.current[nextIndex]?.focus();
    onChange(nextItem.key);
  }

  return (
    <div
      aria-label={ariaLabel}
      className={`scrollbar-hidden flex max-w-full overflow-x-auto rounded-lg border border-line bg-surface-muted/60 p-1 ${className}`}
      role="group"
    >
      {items.map((item, index) => {
        const active = item.key === value;
        return (
          <button
            aria-pressed={active}
            className={`min-h-11 shrink-0 rounded-md px-4 text-sm font-extrabold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 sm:flex-1 ${active ? 'bg-accent text-white shadow-sm' : 'text-muted hover:bg-surface hover:text-ink'}`}
            key={item.key}
            onClick={() => onChange(item.key)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            ref={(element) => {
              buttonRefs.current[index] = element;
            }}
            type="button"
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      aria-checked={checked}
      aria-label={label}
      className={`inline-flex h-11 w-16 shrink-0 items-center rounded-full p-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 ${checked ? 'bg-accent' : 'bg-line'} disabled:opacity-50`}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      role="switch"
      type="button"
    >
      <span
        className={`block size-7 rounded-full bg-white shadow-sm transition-transform ${checked ? 'translate-x-7' : 'translate-x-0'}`}
      />
    </button>
  );
}

export function LoadingState({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="grid gap-3" role="status" aria-label={label}>
      {[0, 1, 2].map((item) => (
        <div
          className="animate-pulse rounded-lg border border-line bg-surface p-5 shadow-community-card"
          key={item}
        >
          <div className="h-4 w-32 rounded bg-surface-muted" />
          <div className="mt-4 h-5 w-4/5 rounded bg-surface-muted" />
          <div className="mt-3 h-4 w-full rounded bg-surface-muted" />
          <div className="mt-2 h-4 w-2/3 rounded bg-surface-muted" />
        </div>
      ))}
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <Card className="grid min-h-52 place-items-center p-6 text-center">
      <div className="grid max-w-md justify-items-center gap-3">
        <span className="grid size-11 place-items-center rounded-lg bg-surface-muted text-muted">
          {icon ?? <Inbox aria-hidden="true" className="size-5" />}
        </span>
        <p className="font-black text-ink">{title}</p>
        {description && <p className="text-sm leading-relaxed text-muted">{description}</p>}
        {action && <div className="mt-1">{action}</div>}
      </div>
    </Card>
  );
}

export function ErrorState({
  onRetry,
  title = 'Could not load this content.',
  description = 'Please try again.',
  retryLabel = 'Try again',
}: {
  onRetry?: () => void;
  title?: string;
  description?: string;
  retryLabel?: string;
}) {
  return (
    <Card className="grid min-h-52 place-items-center p-6 text-center">
      <div className="grid max-w-md justify-items-center gap-3">
        <span className="grid size-11 place-items-center rounded-lg bg-red-50 text-danger">
          <AlertCircle aria-hidden="true" className="size-5" />
        </span>
        <p className="font-black text-ink">{title}</p>
        <p className="text-sm leading-relaxed text-muted">{description}</p>
        {onRetry && (
          <SecondaryButton onClick={onRetry} type="button">
            {retryLabel}
          </SecondaryButton>
        )}
      </div>
    </Card>
  );
}

import type { ReactNode } from 'react';

export function SettingsCard({
  children,
  description,
  title,
}: {
  children: ReactNode;
  description?: string;
  title: string;
}) {
  return (
    <section className="rounded-lg border border-catalogue-line bg-catalogue-surface p-5">
      <h2 className="text-base font-bold text-catalogue-ink">{title}</h2>
      {description && <p className="mt-1 text-sm text-catalogue-muted">{description}</p>}
      <div className="mt-4 grid gap-4">{children}</div>
    </section>
  );
}

export function SettingsField({
  children,
  hint,
  label,
  htmlFor,
}: {
  children: ReactNode;
  hint?: string;
  label: string;
  htmlFor?: string;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold text-catalogue-muted" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-catalogue-dim">{hint}</p>}
    </div>
  );
}

export const settingsInputClassName =
  'min-h-9 w-full rounded-lg border border-catalogue-line bg-catalogue-bg px-3 text-sm text-catalogue-ink placeholder:text-catalogue-dim focus:border-catalogue-blue focus:outline-none focus:ring-2 focus:ring-catalogue-blue/25';

export function SettingsPrimaryButton({
  children,
  disabled,
  onClick,
  type = 'button',
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick?: () => void;
  type?: 'button' | 'submit';
}) {
  return (
    <button
      className="inline-flex min-h-9 w-fit items-center gap-1.5 rounded-lg bg-catalogue-blue px-4 text-sm font-semibold text-white transition-colors hover:bg-catalogue-blue-bright disabled:cursor-not-allowed disabled:opacity-60"
      disabled={disabled}
      onClick={onClick}
      type={type}
    >
      {children}
    </button>
  );
}

export function SettingsSecondaryButton({
  children,
  disabled,
  onClick,
  type = 'button',
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick?: () => void;
  type?: 'button' | 'submit';
}) {
  return (
    <button
      className="inline-flex min-h-9 w-fit items-center gap-1.5 rounded-lg border border-catalogue-line bg-catalogue-bg px-4 text-sm font-semibold text-catalogue-ink transition-colors hover:bg-catalogue-surface-hover disabled:cursor-not-allowed disabled:opacity-60"
      disabled={disabled}
      onClick={onClick}
      type={type}
    >
      {children}
    </button>
  );
}

export function SettingsErrorText({ children }: { children: ReactNode }) {
  return (
    <p className="text-sm font-semibold text-danger" role="alert">
      {children}
    </p>
  );
}

export function SettingsSuccessText({ children }: { children: ReactNode }) {
  return <p className="text-sm font-semibold text-catalogue-green">{children}</p>;
}

import type { ButtonHTMLAttributes, ReactNode } from 'react';

/**
 * Shared primary CTA for every full-page auth route, matching
 * AuthGateDialog's inline catalogue-themed button rather than the shared
 * ui.tsx PrimaryButton (whose base bg-accent/rounded-lg classes don't match
 * this page family's sharp-corner, catalogue-token styling). Extracted from
 * login/page.tsx so register, forgot-password, reset-password, and
 * accept-invite all render the same button instead of ui.tsx's generic one.
 */
export function AuthPrimaryButton({
  children,
  className = '',
  disabled,
  type = 'button',
}: {
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  type?: ButtonHTMLAttributes<HTMLButtonElement>['type'];
}) {
  return (
    <button
      className={`inline-flex min-h-[46px] w-full items-center justify-center rounded-[7px] bg-catalogue-blue text-[15px] font-semibold text-white shadow-[0_1px_2px_rgba(168,102,224,0.3)] transition-colors hover:bg-catalogue-blue-bright focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-catalogue-blue-bright/60 disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
      disabled={disabled}
      type={type}
    >
      {children}
    </button>
  );
}

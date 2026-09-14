import type { ButtonHTMLAttributes, ReactNode } from 'react';

/**
 * Shared primary CTA for every stream-auth page, deliberately NOT the
 * shared ui.tsx PrimaryButton (whose base bg-accent/rounded-lg classes were
 * fighting this page family's bg-auth-accent/rounded-[7px] overrides at
 * equal CSS specificity -- class *order* in the compiled stylesheet decided
 * the winner, not the JSX override, which made the button intermittently
 * render with no visible fill). Explicit inline background/text color
 * guarantees the fill always renders regardless of utility-class cascade
 * order. Extracted from login/page.tsx so register, forgot-password,
 * reset-password, and accept-invite all render the same button instead of
 * ui.tsx's generic one.
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
      className={`inline-flex min-h-[46px] w-full items-center justify-center rounded-[7px] text-[15px] font-semibold shadow-[0_1px_2px_rgba(13,99,243,0.25)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-auth-accent/35 disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
      disabled={disabled}
      style={{ backgroundColor: 'var(--auth-accent, #0d63f3)', color: '#fff' }}
      onMouseEnter={(e) => {
        if (!disabled) e.currentTarget.style.backgroundColor = 'var(--auth-accent-dark, #0954d4)';
      }}
      onMouseLeave={(e) => {
        if (!disabled) e.currentTarget.style.backgroundColor = 'var(--auth-accent, #0d63f3)';
      }}
      type={type}
    >
      {children}
    </button>
  );
}

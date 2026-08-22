'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface ActionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  pending?: boolean;
  pendingLabel?: ReactNode;
}

export function ActionButton({
  pending = false,
  pendingLabel,
  children,
  disabled,
  className = '',
  ...props
}: ActionButtonProps) {
  const progress = pendingLabel ?? children;
  return (
    <button
      aria-busy={pending}
      className={`action-button ${className}`}
      disabled={disabled || pending}
      {...props}
    >
      <span className="inline-grid place-items-center">
        <span
          className={`col-start-1 row-start-1 inline-flex items-center justify-center gap-2 ${pending ? 'invisible' : ''}`}
          aria-hidden={pending}
        >
          {children}
        </span>
        <span
          className={`col-start-1 row-start-1 inline-flex items-center justify-center gap-2 ${pending ? '' : 'invisible'}`}
          aria-hidden={!pending}
        >
          <ActionSpinner />
          {progress}
        </span>
      </span>
    </button>
  );
}

export function ActionSpinner({ className = '' }: { className?: string }) {
  return (
    <svg
      className={`action-spinner size-4 shrink-0 ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.28" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

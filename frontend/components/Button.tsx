import { ButtonHTMLAttributes, ReactNode } from 'react';
import { ActionButton } from './ui/ActionButton';

const base =
  'inline-flex min-h-11 items-center justify-center rounded-lg px-4 py-3 font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-60';
const variants = {
  primary: 'border border-accent bg-accent text-white hover:bg-accent-dark',
  secondary: 'border border-line bg-surface text-ink hover:bg-surface-muted',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variants;
  pending?: boolean;
  pendingLabel?: ReactNode;
}

export function Button({ variant = 'primary', className = '', pending, pendingLabel, ...props }: ButtonProps) {
  return <ActionButton className={`${base} ${variants[variant]} ${className}`} pending={pending} pendingLabel={pendingLabel} {...props} />;
}

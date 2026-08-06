import { ButtonHTMLAttributes } from 'react';

const base = 'inline-flex min-h-11 items-center justify-center rounded-lg px-4 py-3 font-bold disabled:cursor-not-allowed disabled:opacity-60';
const variants = {
  primary: 'border border-accent bg-accent text-white hover:bg-accent-dark',
  secondary: 'border border-line bg-surface text-ink hover:bg-surface-muted',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variants;
}

export function Button({ variant = 'primary', className = '', ...props }: ButtonProps) {
  return <button className={`${base} ${variants[variant]} ${className}`} {...props} />;
}

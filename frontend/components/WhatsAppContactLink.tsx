import { Phone } from 'lucide-react';

/** Name is always shown paired with a phone number, never alone -- together they let either side confirm they're talking to the right person instead of trusting a bare phone number a scammer could also produce. */
export function formatContact(
  firstName: string | null,
  lastName: string | null,
  phoneNumber: string,
): string {
  const name = [firstName, lastName].filter(Boolean).join(' ');
  return name ? `${name} · ${phoneNumber}` : phoneNumber;
}

export function waLink(phoneNumber: string, prefilledMessage?: string): string {
  const base = `https://wa.me/${phoneNumber.replace(/\D/g, '')}`;
  return prefilledMessage ? `${base}?text=${encodeURIComponent(prefilledMessage)}` : base;
}

/**
 * Tap-to-chat link, styled like an inline text link rather than a button --
 * used wherever a phone number/name appears so either side can jump
 * straight into WhatsApp with the peer instead of copying the number by
 * hand. Shared by the WhatsApp Validator integration and P2P trade view --
 * both surface a peer's real phone number only once the two sides are
 * actually matched (a claimed validation request / an accepted trade), so
 * this component itself has no gating logic of its own; the caller only
 * renders it once it already has a real phoneNumber to show.
 */
export function WhatsAppContactLink({
  firstName,
  lastName,
  phoneNumber,
  prefilledMessage,
  className = '',
}: {
  firstName: string | null;
  lastName: string | null;
  phoneNumber: string;
  /** Pre-fills the WhatsApp message compose box -- e.g. an admin's dispute context so they don't have to retype it. */
  prefilledMessage?: string;
  className?: string;
}) {
  return (
    <a
      className={`inline-flex items-center gap-1.5 underline decoration-dotted underline-offset-2 hover:text-accent ${className}`}
      href={waLink(phoneNumber, prefilledMessage)}
      rel="noreferrer"
      target="_blank"
    >
      <Phone className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="truncate">{formatContact(firstName, lastName, phoneNumber)}</span>
    </a>
  );
}

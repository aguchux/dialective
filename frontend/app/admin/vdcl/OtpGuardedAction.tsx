'use client';

import { useState, type ReactNode } from 'react';
import { KeyRound } from 'lucide-react';
import { ActionButton } from '@/components/ui/ActionButton';
import { fieldClass, primaryButton, secondaryButton } from '@/components/vdcl/vdcl-ui';

export type VdclAdminAction =
  | 'vdcl-suspend'
  | 'vdcl-reinstate'
  | 'vdcl-revoke'
  | 'vdcl-withdraw'
  | 'vdcl-reissue';

/**
 * A licence action behind a confirmation code.
 *
 * Every control on this screen either stops a contributor's work reaching
 * subscribers, sends their licence back, or changes what their certificate
 * verifies against -- and each was a single click. Suspending a licence by
 * accident cut a real person off with no confirmation at all.
 *
 * So the action is a two-step: request a code, then enter it. The button
 * that does the thing does not exist until a code has been issued, which is
 * what makes a stray click harmless rather than merely discouraged.
 *
 * The code is bound server-side to the action and its target, so one issued
 * to suspend a licence cannot be used to revoke it, and one issued for this
 * licence cannot be used on another.
 */
export function OtpGuardedAction({
  action,
  label,
  icon,
  disabled,
  pending,
  pendingLabel,
  variant = 'secondary',
  onRequestCode,
  onConfirm,
}: {
  action: VdclAdminAction;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
  pending?: boolean;
  pendingLabel?: string;
  variant?: 'primary' | 'secondary';
  /** Issues a code for this action; resolves to the request id. */
  onRequestCode: (action: VdclAdminAction) => Promise<string>;
  onConfirm: (step: { otpRequestId: string; code: string }) => Promise<unknown>;
}) {
  const [otpRequestId, setOtpRequestId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [sending, setSending] = useState(false);

  const buttonClass = variant === 'primary' ? primaryButton : secondaryButton;

  if (!otpRequestId) {
    return (
      <ActionButton
        className={buttonClass}
        disabled={disabled || sending}
        pending={sending}
        pendingLabel="Sending code..."
        onClick={() => {
          setSending(true);
          return onRequestCode(action)
            .then((id) => setOtpRequestId(id))
            .finally(() => setSending(false));
        }}
      >
        <span className="inline-flex items-center gap-2">
          <KeyRound className="size-4" aria-hidden="true" />
          {label}
        </span>
      </ActionButton>
    );
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="grid gap-1.5">
        <label className="text-xs font-bold text-ink" htmlFor={`otp-${action}-${otpRequestId}`}>
          Confirmation code
        </label>
        <input
          autoComplete="one-time-code"
          className={`${fieldClass} max-w-40 font-mono tracking-[0.3em]`}
          id={`otp-${action}-${otpRequestId}`}
          inputMode="numeric"
          onChange={(e) => setCode(e.target.value)}
          placeholder="000000"
          value={code}
        />
      </div>
      <ActionButton
        className={buttonClass}
        disabled={!code.trim() || disabled || pending}
        pending={pending}
        pendingLabel={pendingLabel}
        onClick={() =>
          onConfirm({ otpRequestId, code }).then(() => {
            setOtpRequestId(null);
            setCode('');
          })
        }
      >
        <span className="inline-flex items-center gap-2">
          {icon}
          {label}
        </span>
      </ActionButton>
      <button
        className="text-sm font-bold text-muted underline"
        onClick={() => {
          setOtpRequestId(null);
          setCode('');
        }}
        type="button"
      >
        Cancel
      </button>
    </div>
  );
}

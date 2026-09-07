'use client';

import { FormEvent, useState } from 'react';
import { signOut } from 'next-auth/react';
import { RefreshCw, ShieldAlert } from 'lucide-react';
import {
  useChangePasswordMutation,
  useCloseAccountMutation,
  useGetMeQuery,
  useRequestAccountCloseOtpMutation,
  useUpdateTwoFactorMutation,
  normalizeErrorMessage,
} from '@/store/api';
import { cardClass, SectionTitle } from '@/components/dashboard/shared';
import { ActionButton } from '@/components/ui/ActionButton';
import { Dialog, DialogContent } from '@/components/ui/Dialog';
import { PasswordRequirementsList } from '@/components/ui/PasswordRequirementsList';
import { isStrongPassword } from '@/lib/password-strength';

const inputClass =
  'min-h-10 w-full rounded-lg border border-line bg-white px-3 py-2.5 text-ink dark:bg-surface-muted';

export function SecurityView() {
  const { data: me } = useGetMeQuery();

  return (
    <div className="grid gap-6">
      <SectionTitle title="Security" subtitle="Password, two-factor login, and account closure." />
      <PasswordSection />
      <TwoFactorSection
        phoneVerified={me?.phoneVerified ?? false}
        twoFactorEmailEnabled={me?.twoFactorEmailEnabled ?? false}
        twoFactorSmsEnabled={me?.twoFactorSmsEnabled ?? false}
      />
      <DangerZoneSection />
    </div>
  );
}

function PasswordSection() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [changePassword, { isLoading }] = useChangePasswordMutation();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    setError(null);
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.');
      return;
    }
    try {
      await changePassword({ currentPassword, newPassword }).unwrap();
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setMessage('Password changed. Your other sessions have been signed out.');
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Could not change your password.'));
    }
  }

  return (
    <div className={`${cardClass} grid gap-4 p-5`}>
      <SectionTitle title="Password" subtitle="Changing your password signs out every other session." />
      <form className="grid max-w-sm gap-2.5" onSubmit={handleSubmit}>
        <input
          autoComplete="current-password"
          className={inputClass}
          onChange={(e) => setCurrentPassword(e.target.value)}
          placeholder="Current password"
          required
          type="password"
          value={currentPassword}
        />
        <input
          autoComplete="new-password"
          className={inputClass}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="New password"
          required
          type="password"
          value={newPassword}
        />
        {newPassword && <PasswordRequirementsList password={newPassword} />}
        <input
          autoComplete="new-password"
          className={inputClass}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="Confirm new password"
          required
          type="password"
          value={confirmPassword}
        />
        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-danger dark:bg-red-950">
            {error}
          </p>
        )}
        {message && <p className="text-sm font-bold text-success">{message}</p>}
        <div>
          <ActionButton
            className="min-h-11 rounded-lg bg-accent px-5 font-extrabold text-white hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!currentPassword || !isStrongPassword(newPassword) || !confirmPassword}
            pending={isLoading}
            pendingLabel="Saving"
            type="submit"
          >
            Change password
          </ActionButton>
        </div>
      </form>
    </div>
  );
}

function TwoFactorSection({
  phoneVerified,
  twoFactorEmailEnabled,
  twoFactorSmsEnabled,
}: {
  phoneVerified: boolean;
  twoFactorEmailEnabled: boolean;
  twoFactorSmsEnabled: boolean;
}) {
  const [updateTwoFactor] = useUpdateTwoFactorMutation();
  const [saving, setSaving] = useState<'email' | 'sms' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle(channel: 'email' | 'sms', checked: boolean) {
    setError(null);
    setSaving(channel);
    try {
      await updateTwoFactor(
        channel === 'email' ? { emailEnabled: checked } : { smsEnabled: checked },
      ).unwrap();
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Could not update two-factor authentication.'));
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className={`${cardClass} grid gap-4 p-5`}>
      <SectionTitle
        title="Two-factor authentication"
        subtitle="Off by default. Turn on a code step after your password if you want it."
      />
      <div className="grid divide-y divide-line overflow-hidden rounded-lg border border-line">
        <TwoFactorToggleRow
          checked={twoFactorEmailEnabled}
          label="Email"
          loading={saving === 'email'}
          onChange={(checked) => void toggle('email', checked)}
          subtitle="Send a login code to your email address."
        />
        <TwoFactorToggleRow
          checked={twoFactorSmsEnabled}
          disabled={!phoneVerified}
          label="SMS"
          loading={saving === 'sms'}
          onChange={(checked) => void toggle('sms', checked)}
          subtitle={
            phoneVerified
              ? 'Send a login code by text message.'
              : 'Verify a phone number in Profile to enable this.'
          }
        />
      </div>
      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-danger dark:bg-red-950">
          {error}
        </p>
      )}
    </div>
  );
}

function TwoFactorToggleRow({
  checked,
  disabled,
  label,
  loading,
  onChange,
  subtitle,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  loading: boolean;
  onChange: (checked: boolean) => void;
  subtitle: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 bg-surface px-4 py-3">
      <div className="min-w-0">
        <p className="font-extrabold text-ink">{label}</p>
        <p className="mt-0.5 text-sm text-muted">{subtitle}</p>
      </div>
      <button
        aria-checked={checked}
        aria-label={`${checked ? 'Disable' : 'Enable'} ${label} two-factor authentication`}
        className={`relative h-7 w-12 shrink-0 rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
          checked ? 'border-accent bg-accent' : 'border-line bg-surface-muted'
        }`}
        disabled={disabled || loading}
        onClick={() => onChange(!checked)}
        role="switch"
        type="button"
      >
        <span
          className={`absolute top-1 grid size-5 place-items-center rounded-full bg-white text-accent shadow-sm transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-1'
          }`}
        >
          {loading ? <RefreshCw className="size-3 animate-spin" aria-hidden="true" /> : null}
        </span>
      </button>
    </div>
  );
}

function DangerZoneSection() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<'confirm' | 'otp'>('confirm');
  const [otpRequestId, setOtpRequestId] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [requestAccountCloseOtp, { isLoading: requesting }] = useRequestAccountCloseOtpMutation();
  const [closeAccount, { isLoading: closing }] = useCloseAccountMutation();

  function reset() {
    setStep('confirm');
    setOtpRequestId('');
    setCode('');
    setError(null);
  }

  async function handleRequestOtp() {
    setError(null);
    try {
      const result = await requestAccountCloseOtp().unwrap();
      setOtpRequestId(result.otpRequestId);
      setStep('otp');
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Could not send a confirmation code.'));
    }
  }

  async function handleConfirmClose(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await closeAccount({ otpRequestId, code }).unwrap();
      await signOut({ callbackUrl: '/' });
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Could not close your account.'));
    }
  }

  return (
    <div className={`${cardClass} grid gap-4 border-danger/30 p-5`}>
      <SectionTitle title="Danger zone" subtitle="Closing your account cannot be undone by you." />
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-danger/30 bg-red-50 px-4 py-3 dark:bg-red-950">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden="true" />
          <div>
            <p className="font-extrabold text-ink">Close account</p>
            <p className="mt-0.5 text-sm text-muted">
              Signs you out everywhere immediately. Your data is retained briefly, then permanently
              removed.
            </p>
          </div>
        </div>
        <button
          className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-lg border border-danger bg-white px-3.5 font-bold text-danger transition-colors hover:bg-red-50 dark:bg-surface"
          onClick={() => {
            reset();
            setOpen(true);
          }}
          type="button"
        >
          Close account
        </button>
      </div>

      <Dialog onOpenChange={setOpen} open={open}>
        <DialogContent
          description={
            step === 'confirm'
              ? "We'll send a confirmation code to your email before this takes effect."
              : 'Enter the code we just emailed you to permanently confirm closing your account.'
          }
          title="Close your account"
        >
          {step === 'confirm' ? (
            <div className="grid gap-4">
              {error && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-danger dark:bg-red-950">
                  {error}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <button
                  className="inline-flex min-h-10 items-center justify-center rounded-lg border border-line bg-surface px-3.5 font-bold text-ink hover:bg-surface-muted"
                  onClick={() => setOpen(false)}
                  type="button"
                >
                  Cancel
                </button>
                <ActionButton
                  className="min-h-10 rounded-lg border border-danger bg-danger px-3.5 font-bold text-white hover:bg-danger/90"
                  onClick={handleRequestOtp}
                  pending={requesting}
                  pendingLabel="Sending code"
                  type="button"
                >
                  Send confirmation code
                </ActionButton>
              </div>
            </div>
          ) : (
            <form className="grid gap-4" onSubmit={handleConfirmClose}>
              <input
                autoFocus
                className={`${inputClass} text-center text-lg font-bold tracking-[0.3em]`}
                inputMode="numeric"
                maxLength={6}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                pattern="\d{6}"
                placeholder="000000"
                required
                value={code}
              />
              {error && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-danger dark:bg-red-950">
                  {error}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <button
                  className="inline-flex min-h-10 items-center justify-center rounded-lg border border-line bg-surface px-3.5 font-bold text-ink hover:bg-surface-muted"
                  onClick={() => setOpen(false)}
                  type="button"
                >
                  Cancel
                </button>
                <ActionButton
                  className="min-h-10 rounded-lg border border-danger bg-danger px-3.5 font-bold text-white hover:bg-danger/90 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={code.length !== 6}
                  pending={closing}
                  pendingLabel="Closing"
                  type="submit"
                >
                  Permanently close account
                </ActionButton>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

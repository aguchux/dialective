'use client';

import { FormEvent, useState } from 'react';
import { AdminShell } from '@/components/admin/AdminShell';
import { Dialog, DialogClose, DialogContent, DialogTrigger } from '@/components/ui/Dialog';
import { ActionButton } from '@/components/ui/ActionButton';
import {
  AdminWithdrawalRequest,
  normalizeErrorMessage,
  useApproveWithdrawalMutation,
  useGetPlatformSettingsQuery,
  useListAdminWithdrawalsQuery,
  useRefreshWithdrawalStatusMutation,
  useRefreshWithdrawalStatusFlutterwaveMutation,
  useRequestWithdrawalResolveOtpMutation,
  useResolveWithdrawalMutation,
  useSubmitWithdrawalToNowPaymentsMutation,
  useSubmitWithdrawalToFlutterwaveMutation,
  useVerifyWithdrawalPayoutMutation,
  WithdrawalStatus,
} from '@/store/api';

const STATUS_TABS: { label: string; value: WithdrawalStatus | 'ALL' }[] = [
  { label: 'Pending', value: 'PENDING' },
  { label: 'Approved', value: 'APPROVED' },
  { label: 'Processing', value: 'PROCESSING' },
  { label: 'Paid', value: 'PAID' },
  { label: 'Failed', value: 'FAILED' },
  { label: 'Rejected', value: 'REJECTED' },
  { label: 'All', value: 'ALL' },
];

const statusTone: Record<WithdrawalStatus, string> = {
  PENDING: 'bg-surface text-muted',
  APPROVED: 'bg-blue-50 text-blue-700',
  PROCESSING: 'bg-amber-50 text-amber-700',
  PAID: 'bg-emerald-50 text-emerald-700',
  FAILED: 'bg-red-50 text-danger',
  REJECTED: 'bg-red-50 text-danger',
};

export default function AdminWithdrawalsPage() {
  const [tab, setTab] = useState<WithdrawalStatus | 'ALL'>('PENDING');
  const { data: withdrawals = [], isLoading } = useListAdminWithdrawalsQuery(
    tab === 'ALL' ? undefined : { status: tab },
  );
  const { data: platformSettings } = useGetPlatformSettingsQuery();

  return (
    <AdminShell>
      <div className="grid gap-6">
        <div>
          <h1 className="text-3xl font-black">Withdrawals</h1>
          <p className="mt-2 text-muted">
            Review, approve, and submit crypto (NOWPayments) and fiat (Flutterwave) withdrawal
            payouts.
          </p>
          {platformSettings && !platformSettings.nowPaymentsPayoutsEnabled && (
            <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-800">
              NOWPayments payouts are disabled in Settings -- crypto withdrawals can still be
              approved and rejected, but not submitted to the provider until this is turned on.
            </p>
          )}
          {platformSettings && !platformSettings.isFlutterwavePayoutsEnabled && (
            <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-800">
              Flutterwave payouts are disabled in Settings -- fiat withdrawals can still be approved
              and rejected, but not submitted to the provider until this is turned on.
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {STATUS_TABS.map((option) => (
            <button
              className={`min-h-9 rounded-lg border px-3 text-sm font-extrabold ${tab === option.value ? 'border-accent bg-accent text-white' : 'border-line bg-white text-ink'}`}
              key={option.value}
              onClick={() => setTab(option.value)}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="overflow-x-auto rounded-lg border border-line bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-surface text-muted">
              <tr>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Trainer</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Destination</th>
                <th className="px-4 py-3">Provider</th>
                <th className="px-4 py-3">Requested</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td className="px-4 py-5" colSpan={7}>
                    Loading withdrawals...
                  </td>
                </tr>
              )}
              {!isLoading && withdrawals.length === 0 && (
                <tr>
                  <td className="px-4 py-5" colSpan={7}>
                    No withdrawals in this view.
                  </td>
                </tr>
              )}
              {withdrawals.map((withdrawal) => (
                <WithdrawalRow
                  key={withdrawal.id}
                  withdrawal={withdrawal}
                  otpRequired={platformSettings?.adminPayoutOtpEnabled ?? false}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AdminShell>
  );
}

function WithdrawalRow({
  withdrawal,
  otpRequired,
}: {
  withdrawal: AdminWithdrawalRequest;
  otpRequired: boolean;
}) {
  const isCrypto = !withdrawal.payoutMethod || withdrawal.payoutMethod === 'CRYPTO';
  const [refreshNowPayments, { isLoading: refreshingNowPayments }] =
    useRefreshWithdrawalStatusMutation();
  const [refreshFlutterwave, { isLoading: refreshingFlutterwave }] =
    useRefreshWithdrawalStatusFlutterwaveMutation();
  const refreshing = refreshingNowPayments || refreshingFlutterwave;
  const [error, setError] = useState('');

  async function handleRefresh() {
    setError('');
    try {
      if (isCrypto) {
        await refreshNowPayments(withdrawal.id).unwrap();
      } else {
        await refreshFlutterwave(withdrawal.id).unwrap();
      }
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Could not refresh status'));
    }
  }

  return (
    <tr className="border-t border-line align-top">
      <td className="px-4 py-3">
        <span
          className={`rounded-md px-2 py-1 text-xs font-black ${statusTone[withdrawal.status]}`}
        >
          {withdrawal.status}
        </span>
        {withdrawal.providerStatus && (
          <p className="mt-1 text-xs text-muted">provider: {withdrawal.providerStatus}</p>
        )}
        {withdrawal.providerError && (
          <p className="mt-1 text-xs font-bold text-danger">{withdrawal.providerError}</p>
        )}
        {error && <p className="mt-1 text-xs font-bold text-danger">{error}</p>}
      </td>
      <td className="px-4 py-3">{withdrawal.wallet.user.email}</td>
      <td className="px-4 py-3">
        {withdrawal.tokenAmount} DL
        {isCrypto ? (
          <p className="text-xs text-muted">
            {withdrawal.usdtAmount} {withdrawal.destinationCurrency}
          </p>
        ) : withdrawal.fiatAmount ? (
          <p className="text-xs text-muted">
            {Number(withdrawal.fiatAmount).toLocaleString(undefined, {
              maximumFractionDigits: 2,
            })}{' '}
            {withdrawal.destinationCurrency}
            {withdrawal.fiatUsdExchangeRate && (
              <span> · 1 USD = {withdrawal.fiatUsdExchangeRate}</span>
            )}
          </p>
        ) : (
          <p className="text-xs text-amber-700">Fiat conversion unavailable</p>
        )}
      </td>
      <td className="max-w-56 truncate px-4 py-3 font-mono text-xs">
        {withdrawal.payoutMethod && withdrawal.payoutMethod !== 'CRYPTO' ? (
          <>
            {withdrawal.destinationAccountNumberMasked ?? withdrawal.destinationMobileNumberMasked}
            <p className="font-sans text-xs text-muted">
              {withdrawal.destinationBankName ??
                withdrawal.destinationMobileNetwork ??
                withdrawal.payoutMethod}
              {withdrawal.destinationAccountName ? ` · ${withdrawal.destinationAccountName}` : ''}
            </p>
          </>
        ) : (
          <>
            <span title={withdrawal.destinationAddress}>{withdrawal.destinationAddress}</span>
            <p className="font-sans text-xs text-muted">{withdrawal.destinationNetwork}</p>
          </>
        )}
      </td>
      <td className="px-4 py-3 text-xs text-muted">
        {withdrawal.providerPayoutId ? (
          <>
            <p className="font-mono">{withdrawal.providerPayoutId}</p>
            {withdrawal.status === 'PROCESSING' && (
              <button
                className="mt-1 font-bold text-accent disabled:opacity-50"
                disabled={refreshing}
                onClick={handleRefresh}
                type="button"
              >
                {refreshing ? 'Refreshing…' : 'Refresh status'}
              </button>
            )}
          </>
        ) : (
          '—'
        )}
      </td>
      <td className="whitespace-nowrap px-4 py-3">
        {new Date(withdrawal.createdAt).toLocaleString()}
      </td>
      <td className="px-4 py-3">
        <WithdrawalActions otpRequired={otpRequired} withdrawal={withdrawal} />
      </td>
    </tr>
  );
}

function WithdrawalActions({
  withdrawal,
  otpRequired,
}: {
  withdrawal: AdminWithdrawalRequest;
  otpRequired: boolean;
}) {
  if (withdrawal.status === 'PENDING') {
    return (
      <div className="flex flex-wrap gap-1.5">
        <WithdrawalActionDialog
          action="approve"
          otpRequired={otpRequired}
          withdrawal={withdrawal}
        />
        <WithdrawalActionDialog action="reject" otpRequired={false} withdrawal={withdrawal} />
      </div>
    );
  }
  if (withdrawal.status === 'APPROVED') {
    return (
      <div className="flex flex-wrap gap-1.5">
        <WithdrawalActionDialog action="submit" otpRequired={otpRequired} withdrawal={withdrawal} />
        <WithdrawalActionDialog
          action="paid"
          otpRequired={otpRequired}
          withdrawal={withdrawal}
          label="Mark paid manually"
        />
      </div>
    );
  }
  if (
    withdrawal.status === 'PROCESSING' &&
    withdrawal.providerPayoutId &&
    (!withdrawal.payoutMethod || withdrawal.payoutMethod === 'CRYPTO')
  ) {
    // Flutterwave has no confirmed equivalent to NOWPayments' 2FA payout
    // verification step -- fiat PROCESSING withdrawals rely on the webhook
    // and the "Refresh status" link already rendered in the destination
    // column instead.
    return <WithdrawalVerifyDialog withdrawal={withdrawal} />;
  }
  if (withdrawal.status === 'FAILED') {
    return (
      <div className="flex flex-wrap gap-1.5">
        <WithdrawalActionDialog
          action="approve"
          label="Re-approve & retry"
          otpRequired={otpRequired}
          withdrawal={withdrawal}
        />
        <WithdrawalActionDialog
          action="reject"
          label="Reject & refund"
          otpRequired={false}
          withdrawal={withdrawal}
        />
      </div>
    );
  }
  return <span className="text-xs text-muted">No actions</span>;
}

type ActionKind = 'approve' | 'submit' | 'paid' | 'reject';

const actionCopy: Record<ActionKind, { title: string; description: string; confirmLabel: string }> =
  {
    approve: {
      title: 'Approve withdrawal',
      description:
        'Confirm you have reviewed this withdrawal before it can be submitted to the payout provider.',
      confirmLabel: 'Approve',
    },
    submit: {
      title: 'Submit payout',
      description: 'This sends the payout request to the provider now.',
      confirmLabel: 'Submit payout',
    },
    paid: {
      title: 'Mark paid manually',
      description: 'Only use this if you sent the payout outside of NOWPayments.',
      confirmLabel: 'Mark paid',
    },
    reject: {
      title: 'Reject withdrawal',
      description: 'DL will be refunded to the trainer’s balance immediately.',
      confirmLabel: 'Reject & refund',
    },
  };

function WithdrawalActionDialog({
  action,
  withdrawal,
  otpRequired,
  label,
}: {
  action: ActionKind;
  withdrawal: AdminWithdrawalRequest;
  otpRequired: boolean;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [otpRequestId, setOtpRequestId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [adminNote, setAdminNote] = useState('');
  const [error, setError] = useState('');

  const isCrypto = !withdrawal.payoutMethod || withdrawal.payoutMethod === 'CRYPTO';
  const [requestOtp, { isLoading: requestingOtp }] = useRequestWithdrawalResolveOtpMutation();
  const [approve, { isLoading: approving }] = useApproveWithdrawalMutation();
  const [submitNowPayments, { isLoading: submittingNowPayments }] =
    useSubmitWithdrawalToNowPaymentsMutation();
  const [submitFlutterwave, { isLoading: submittingFlutterwave }] =
    useSubmitWithdrawalToFlutterwaveMutation();
  const submitting = submittingNowPayments || submittingFlutterwave;
  const [resolve, { isLoading: resolving }] = useResolveWithdrawalMutation();

  const pending = requestingOtp || approving || submitting || resolving;
  const needsOtp = action !== 'reject' && otpRequired;

  function reset() {
    setOtpRequestId(null);
    setCode('');
    setAdminNote('');
    setError('');
  }

  async function run(otp?: { otpRequestId: string; code: string }) {
    if (action === 'approve')
      return approve({ id: withdrawal.id, adminNote, ...(otp ?? {}) }).unwrap();
    if (action === 'submit')
      return isCrypto
        ? submitNowPayments({ id: withdrawal.id, adminNote, ...(otp ?? {}) }).unwrap()
        : submitFlutterwave({ id: withdrawal.id, adminNote, ...(otp ?? {}) }).unwrap();
    if (action === 'paid')
      return resolve({ id: withdrawal.id, outcome: 'paid', adminNote, ...(otp ?? {}) }).unwrap();
    return resolve({ id: withdrawal.id, outcome: 'rejected', adminNote }).unwrap();
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    try {
      if (needsOtp && !otpRequestId) {
        const result = await requestOtp(withdrawal.id).unwrap();
        setOtpRequestId(result.otpRequestId);
        return;
      }
      await run(otpRequestId ? { otpRequestId, code } : undefined);
      setOpen(false);
      reset();
    } catch (err) {
      setError(
        normalizeErrorMessage(
          err,
          otpRequestId ? 'Could not verify this code' : 'Could not complete this action',
        ),
      );
    }
  }

  const copy = actionCopy[action];

  return (
    <Dialog
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
      open={open}
    >
      <DialogTrigger asChild>
        <button
          className={`min-h-8 rounded-lg border px-2.5 text-xs font-extrabold ${action === 'reject' ? 'border-red-200 bg-red-50 text-danger' : 'border-line bg-white text-ink'}`}
          type="button"
        >
          {label ?? copy.confirmLabel}
        </button>
      </DialogTrigger>
      <DialogContent
        title={otpRequestId ? 'Enter your code' : copy.title}
        description={
          otpRequestId ? 'We emailed a 6-digit code to confirm this action.' : copy.description
        }
      >
        <form className="grid gap-3" onSubmit={handleSubmit}>
          {!otpRequestId && (
            <div className="grid gap-2 rounded-lg border border-line bg-surface p-3 text-sm">
              <p>
                <span className="font-bold">Trainer:</span> {withdrawal.wallet.user.email}
              </p>
              <p>
                <span className="font-bold">Amount:</span> {withdrawal.tokenAmount} DL (
                {isCrypto
                  ? `${withdrawal.usdtAmount} ${withdrawal.destinationCurrency}`
                  : withdrawal.fiatAmount
                    ? `${Number(withdrawal.fiatAmount).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${withdrawal.destinationCurrency}`
                    : 'Fiat conversion unavailable'}
                )
              </p>
              {isCrypto ? (
                <>
                  <p className="break-all">
                    <span className="font-bold">Address:</span> {withdrawal.destinationAddress}
                  </p>
                  <p>
                    <span className="font-bold">Network:</span> {withdrawal.destinationNetwork}
                  </p>
                </>
              ) : (
                <>
                  <p className="break-all">
                    <span className="font-bold">Account:</span>{' '}
                    {withdrawal.destinationAccountNumberMasked ??
                      withdrawal.destinationMobileNumberMasked}
                    {withdrawal.destinationAccountName
                      ? ` (${withdrawal.destinationAccountName})`
                      : ''}
                  </p>
                  <p>
                    <span className="font-bold">Bank / network:</span>{' '}
                    {withdrawal.destinationBankName ?? withdrawal.destinationMobileNetwork}
                  </p>
                </>
              )}
              <p>
                <span className="font-bold">Withdrawal ID:</span>{' '}
                <span className="font-mono text-xs">{withdrawal.id}</span>
              </p>
            </div>
          )}
          {!otpRequestId && (
            <label className="grid gap-1.5 text-sm font-bold">
              Admin note (optional)
              <textarea
                className="min-h-16 rounded-lg border border-line bg-white px-3 py-2 text-sm"
                onChange={(e) => setAdminNote(e.target.value)}
                value={adminNote}
              />
            </label>
          )}
          {otpRequestId && (
            <input
              autoFocus
              className="min-h-11 rounded-lg border border-line bg-white px-3 text-center text-lg font-bold tracking-[0.3em]"
              inputMode="numeric"
              maxLength={6}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              required
              value={code}
            />
          )}
          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-danger">{error}</p>
          )}
          <div className="flex justify-end gap-2">
            <DialogClose className="inline-flex min-h-9 items-center rounded-lg border border-line bg-white px-3 text-sm font-bold">
              Cancel
            </DialogClose>
            <ActionButton
              className="inline-flex min-h-10 items-center rounded-lg bg-accent px-3.5 font-bold text-white disabled:opacity-60"
              disabled={otpRequestId !== null && code.length !== 6}
              pending={pending}
              pendingLabel={otpRequestId ? 'Confirming' : 'Working'}
              type="submit"
            >
              {otpRequestId ? 'Confirm' : copy.confirmLabel}
            </ActionButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function WithdrawalVerifyDialog({ withdrawal }: { withdrawal: AdminWithdrawalRequest }) {
  const [open, setOpen] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [error, setError] = useState('');
  const [verify, { isLoading }] = useVerifyWithdrawalPayoutMutation();

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    try {
      await verify({ id: withdrawal.id, verificationCode }).unwrap();
      setOpen(false);
      setVerificationCode('');
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Could not verify this payout'));
    }
  }

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <button
          className="min-h-8 rounded-lg border border-line bg-white px-2.5 text-xs font-extrabold"
          type="button"
        >
          Verify (2FA)
        </button>
      </DialogTrigger>
      <DialogContent
        title="Verify payout"
        description="Enter the NOWPayments 2FA code for this payout, if the provider requires one."
      >
        <form className="grid gap-3" onSubmit={handleSubmit}>
          <input
            autoFocus
            className="min-h-11 rounded-lg border border-line bg-white px-3 text-center text-lg font-bold tracking-[0.2em]"
            maxLength={12}
            onChange={(e) => setVerificationCode(e.target.value)}
            placeholder="Verification code"
            required
            value={verificationCode}
          />
          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-danger">{error}</p>
          )}
          <div className="flex justify-end gap-2">
            <DialogClose className="inline-flex min-h-9 items-center rounded-lg border border-line bg-white px-3 text-sm font-bold">
              Cancel
            </DialogClose>
            <ActionButton
              className="inline-flex min-h-10 items-center rounded-lg bg-accent px-3.5 font-bold text-white disabled:opacity-60"
              pending={isLoading}
              pendingLabel="Verifying"
              type="submit"
            >
              Verify
            </ActionButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

'use client';

import { FormEvent, useState } from 'react';
import { CheckCircle2, MessageCircle, XCircle } from 'lucide-react';
import { ActionButton } from '@/components/ui/ActionButton';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/Dialog';
import { cardClass, EmptyPanel, formatDateTime, SectionTitle } from '@/components/dashboard/shared';
import {
  normalizeErrorMessage,
  useClaimNextWhatsAppValidationMutation,
  useListMyWhatsAppValidationRequestsQuery,
  useRejectWhatsAppValidationRequestMutation,
  useRequestWhatsAppValidationMutation,
  useVerifyWhatsAppValidationRequestMutation,
  WhatsAppValidationClaim,
  WhatsAppValidationRequestStatus,
} from '@/store/api';

const STATUS_LABELS: Record<WhatsAppValidationRequestStatus, string> = {
  PENDING: 'Waiting for a validator',
  CLAIMED: 'Claimed by a validator',
  VERIFIED: 'Verified',
  REJECTED: 'Sent back to the pool',
  EXPIRED: 'Expired',
};

function statusBadgeClass(status: WhatsAppValidationRequestStatus): string {
  if (status === 'VERIFIED') return 'bg-success/10 text-success';
  if (status === 'EXPIRED' || status === 'REJECTED') return 'bg-danger/10 text-danger';
  return 'bg-accent-soft text-accent';
}

/**
 * WhatsApp Validator integration page -- the peer-driven counterpart to
 * the platform's staff-reviewed manual phone verification. Two tabs:
 * "Validate" (claim a pending request from the pool, ask the requester to
 * relay the code over WhatsApp, verify it, earn the fee) and "My requests"
 * (request your OWN phone be verified this way, see the code to relay once
 * claimed). Any subscribed member can do both -- there's no separate
 * requester/validator role.
 */
export function WhatsAppValidator() {
  const [tab, setTab] = useState<'validate' | 'requests'>('validate');

  return (
    <div>
      <SectionTitle
        title="WhatsApp Validator"
        subtitle="Peer-verify a member's WhatsApp number, or get your own verified."
      />

      <div className="mb-5 flex w-fit max-w-full overflow-x-auto rounded-lg border border-line bg-surface p-1">
        <button
          className={`min-h-9 whitespace-nowrap rounded-lg px-3 text-sm font-bold ${
            tab === 'validate' ? 'bg-accent text-white' : 'text-muted hover:bg-surface-muted'
          }`}
          onClick={() => setTab('validate')}
          type="button"
        >
          Validate
        </button>
        <button
          className={`min-h-9 whitespace-nowrap rounded-lg px-3 text-sm font-bold ${
            tab === 'requests' ? 'bg-accent text-white' : 'text-muted hover:bg-surface-muted'
          }`}
          onClick={() => setTab('requests')}
          type="button"
        >
          My requests
        </button>
      </div>

      {tab === 'validate' ? <ValidateTab /> : <MyRequestsTab />}
    </div>
  );
}

function ValidateTab() {
  const [claimNext, { isLoading: claiming }] = useClaimNextWhatsAppValidationMutation();
  const [verify, { isLoading: verifying }] = useVerifyWhatsAppValidationRequestMutation();
  const [reject, { isLoading: rejecting }] = useRejectWhatsAppValidationRequestMutation();
  const [claim, setClaim] = useState<WhatsAppValidationClaim | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [noRequests, setNoRequests] = useState(false);
  const [verified, setVerified] = useState(false);

  async function handleFindNext() {
    setError('');
    setNoRequests(false);
    setVerified(false);
    setCode('');
    try {
      const result = await claimNext().unwrap();
      setClaim(result);
    } catch (err: unknown) {
      const message = normalizeErrorMessage(err, 'Unable to fetch a request right now.');
      if (message.includes('NO_REQUESTS_AVAILABLE')) {
        setNoRequests(true);
        setClaim(null);
      } else {
        setError(message);
      }
    }
  }

  async function handleVerify(event: FormEvent) {
    event.preventDefault();
    if (!claim) return;
    setError('');
    try {
      await verify({ id: claim.id, code: code.trim() }).unwrap();
      setVerified(true);
      setClaim(null);
      setCode('');
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Invalid verification code.'));
    }
  }

  async function handleReject() {
    if (!claim) return;
    setError('');
    try {
      await reject(claim.id).unwrap();
      setClaim(null);
      setNoRequests(false);
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to release this request.'));
    }
  }

  return (
    <div className="grid gap-4">
      {error && (
        <p className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm font-bold text-danger">
          {error}
        </p>
      )}

      {verified && (
        <div className={`${cardClass} flex items-center gap-3 p-4`}>
          <CheckCircle2 className="size-6 text-success" aria-hidden="true" />
          <p className="font-bold">Verified. Your payout has been credited.</p>
        </div>
      )}

      {claim ? (
        <form className={`${cardClass} grid gap-3 p-5`} onSubmit={handleVerify}>
          <div className="flex items-center gap-2">
            <span className="grid size-9 place-items-center rounded-lg bg-accent-soft text-accent">
              <MessageCircle className="size-5" aria-hidden="true" />
            </span>
            <div>
              <p className="font-black">{claim.phoneNumber}</p>
              <p className="text-xs font-bold text-muted">
                Ask this member to send you their code over WhatsApp, then enter it below.
              </p>
            </div>
          </div>
          <p className="text-sm font-extrabold">You'll earn {claim.feeTokenAmount} DL on success</p>
          <label className="grid gap-1.5 text-sm font-bold" htmlFor="whatsapp-validate-code">
            Code from the member
            <input
              className="min-h-10 rounded-lg border border-line bg-white px-3 text-center text-lg font-black tracking-[0.3em] dark:bg-surface-muted"
              id="whatsapp-validate-code"
              inputMode="numeric"
              maxLength={6}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder="123456"
              value={code}
            />
          </label>
          <div className="flex gap-2">
            <ActionButton
              className="min-h-10 flex-1 rounded-lg bg-accent px-3 font-extrabold text-white disabled:opacity-50"
              disabled={code.trim().length !== 6}
              pending={verifying}
              pendingLabel="Verifying"
              type="submit"
            >
              Verify
            </ActionButton>
            <ActionButton
              className="min-h-10 rounded-lg border border-line px-3 font-extrabold hover:bg-surface-muted"
              onClick={handleReject}
              pending={rejecting}
              pendingLabel="Releasing"
              type="button"
            >
              <XCircle className="size-4" aria-hidden="true" /> Skip
            </ActionButton>
          </div>
        </form>
      ) : (
        <div className={`${cardClass} grid gap-3 p-5 text-center`}>
          {noRequests ? (
            <p className="text-sm font-bold text-muted">No requests available right now. Check back soon.</p>
          ) : (
            <p className="text-sm font-bold text-muted">
              Claim a pending WhatsApp verification request from the queue.
            </p>
          )}
          <ActionButton
            className="min-h-10 justify-self-center rounded-lg bg-accent px-4 font-extrabold text-white"
            onClick={handleFindNext}
            pending={claiming}
            pendingLabel="Looking"
            type="button"
          >
            Find a request
          </ActionButton>
        </div>
      )}
    </div>
  );
}

function MyRequestsTab() {
  const { data: requests = [] } = useListMyWhatsAppValidationRequestsQuery();
  const [requestVerification, { isLoading: requesting }] = useRequestWhatsAppValidationMutation();
  const [phoneNumber, setPhoneNumber] = useState('');
  const [error, setError] = useState('');
  const [issuedCode, setIssuedCode] = useState<{ code: string; feeTokenAmount: string } | null>(null);
  const [open, setOpen] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    try {
      const result = await requestVerification({ phoneNumber: phoneNumber.trim() }).unwrap();
      setIssuedCode({ code: result.code, feeTokenAmount: result.feeTokenAmount });
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to request verification.'));
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setIssuedCode(null);
      setPhoneNumber('');
      setError('');
    }
  }

  return (
    <div className="grid gap-4">
      <Dialog onOpenChange={handleOpenChange} open={open}>
        <DialogTrigger asChild>
          <button
            className="justify-self-start rounded-lg bg-accent px-4 py-2 font-extrabold text-white"
            type="button"
          >
            Request WhatsApp verification
          </button>
        </DialogTrigger>
        <DialogContent
          description="A subscribed peer validator will claim this request and ask you to relay your code."
          preventClose={!!issuedCode}
          title="Verify your WhatsApp number"
        >
          {issuedCode ? (
            <div className="grid gap-3">
              <p className="text-sm text-muted">
                Once a validator claims your request, send them this code over WhatsApp:
              </p>
              <p className="justify-self-center rounded-lg bg-accent-soft px-4 py-3 text-center text-3xl font-black tracking-[0.3em] text-accent">
                {issuedCode.code}
              </p>
              <p className="text-sm text-muted">
                A {issuedCode.feeTokenAmount} DL fee will be deducted from your balance once verified.
              </p>
              <button
                className="min-h-10 rounded-lg bg-accent px-3 font-extrabold text-white"
                onClick={() => handleOpenChange(false)}
                type="button"
              >
                Done
              </button>
            </div>
          ) : (
            <form className="grid gap-3" onSubmit={handleSubmit}>
              {error && (
                <p className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm font-bold text-danger">
                  {error}
                </p>
              )}
              <label className="grid gap-1.5 text-sm font-bold" htmlFor="whatsapp-request-phone">
                Phone number
                <input
                  className="min-h-10 rounded-lg border border-line bg-white px-3 dark:bg-surface-muted"
                  id="whatsapp-request-phone"
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="+2348012345678"
                  required
                  type="tel"
                  value={phoneNumber}
                />
              </label>
              <ActionButton
                className="min-h-10 rounded-lg bg-accent px-3 font-extrabold text-white"
                pending={requesting}
                pendingLabel="Requesting"
                type="submit"
              >
                Request verification
              </ActionButton>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {requests.length === 0 && (
        <EmptyPanel icon={MessageCircle} title="No verification requests yet" unframed />
      )}

      <div className="grid gap-3">
        {requests.map((request) => (
          <div className={`${cardClass} flex items-center justify-between gap-3 p-4`} key={request.id}>
            <div>
              <p className="font-black">{request.phoneNumber}</p>
              <p className="text-xs font-bold text-muted">
                Requested {formatDateTime(request.createdAt)}
              </p>
            </div>
            <p className={`rounded-full px-2.5 py-1 text-xs font-black ${statusBadgeClass(request.status)}`}>
              {STATUS_LABELS[request.status]}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

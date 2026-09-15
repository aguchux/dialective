'use client';

import { FormEvent, useState } from 'react';
import { CheckCircle2, MessageCircle, Phone, XCircle } from 'lucide-react';
import { ActionButton } from '@/components/ui/ActionButton';
import { cardClass, EmptyPanel, formatDateTime, SectionTitle } from '@/components/dashboard/shared';
import {
  normalizeErrorMessage,
  useClaimWhatsAppValidationMutation,
  useGetMyWhatsAppValidationRequestQuery,
  useListMyWhatsAppValidationClaimsQuery,
  useListPendingWhatsAppValidationsQuery,
  useRegenerateWhatsAppValidationCodeMutation,
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

/** Name is always shown paired with a phone number, never alone -- together they let either side confirm they're talking to the right person instead of trusting a bare phone number a scammer could also produce. */
function formatContact(
  firstName: string | null,
  lastName: string | null,
  phoneNumber: string,
): string {
  const name = [firstName, lastName].filter(Boolean).join(' ');
  return name ? `${name} · ${phoneNumber}` : phoneNumber;
}

function waLink(phoneNumber: string): string {
  return `https://wa.me/${phoneNumber.replace(/\D/g, '')}`;
}

/** Tap-to-chat link, styled like an inline text link rather than a button -- used wherever a phone number/name appears so either side can jump straight into WhatsApp with the peer instead of copying the number by hand. */
function WhatsAppContactLink({
  firstName,
  lastName,
  phoneNumber,
  className = '',
}: {
  firstName: string | null;
  lastName: string | null;
  phoneNumber: string;
  className?: string;
}) {
  return (
    <a
      className={`inline-flex items-center gap-1.5 underline decoration-dotted underline-offset-2 hover:text-accent ${className}`}
      href={waLink(phoneNumber)}
      rel="noreferrer"
      target="_blank"
    >
      <Phone className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="truncate">{formatContact(firstName, lastName, phoneNumber)}</span>
    </a>
  );
}

/**
 * WhatsApp Validator integration page -- the peer-driven counterpart to
 * the platform's staff-reviewed manual phone verification. Two tabs:
 * "Validate" (browse the pool of pending requests, claim one, ask the
 * requester to relay the code over WhatsApp, verify it, earn the fee) and
 * "Get verified" (request YOUR OWN phone be verified this way -- one
 * request at a time, not a history). Any subscribed member can do both --
 * there's no separate requester/validator role.
 */
export function WhatsAppValidator() {
  const [tab, setTab] = useState<'validate' | 'get-verified'>('validate');

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
            tab === 'get-verified' ? 'bg-accent text-white' : 'text-muted hover:bg-surface-muted'
          }`}
          onClick={() => setTab('get-verified')}
          type="button"
        >
          Get verified
        </button>
      </div>

      {tab === 'validate' ? <ValidateTab /> : <GetVerifiedTab />}
    </div>
  );
}

const PENDING_PAGE_SIZE = 20;

function ValidateTab() {
  const { data: myClaims = [], isFetching: loadingClaims } = useListMyWhatsAppValidationClaimsQuery();
  const [page, setPage] = useState(1);
  const {
    data: pendingPage,
    isFetching: loadingPending,
    refetch: refetchPending,
  } = useListPendingWhatsAppValidationsQuery({ page, pageSize: PENDING_PAGE_SIZE });
  const pending = pendingPage?.items ?? [];
  const totalPages = pendingPage?.totalPages ?? 1;
  const [claimRequest, { isLoading: claiming }] = useClaimWhatsAppValidationMutation();
  const [error, setError] = useState('');
  const [claimingId, setClaimingId] = useState<string | null>(null);

  async function handleClaim(id: string) {
    setError('');
    setClaimingId(id);
    try {
      await claimRequest(id).unwrap();
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Someone else may have just claimed this one -- try another.'));
      refetchPending();
    } finally {
      setClaimingId(null);
    }
  }

  return (
    <div className="grid gap-4">
      {error && (
        <p className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm font-bold text-danger">
          {error}
        </p>
      )}

      {myClaims.length > 0 && (
        <div className="grid gap-3">
          {myClaims.map((claim) => (
            <ClaimedRequestCard key={claim.id} claim={claim} />
          ))}
        </div>
      )}

      {!loadingPending && !loadingClaims && pending.length === 0 && myClaims.length === 0 && page === 1 && (
        <EmptyPanel icon={MessageCircle} title="No requests waiting right now" unframed />
      )}

      {pending.length > 0 && (
        <div className="grid gap-3">
          {pending.map((request) => (
            <div
              className={`${cardClass} flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between`}
              key={request.id}
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
                  <MessageCircle className="size-5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="truncate font-black">
                    {formatContact(request.requesterFirstName, request.requesterLastName, request.phoneNumber)}
                  </p>
                  <p className="text-xs font-bold text-muted">
                    Earn {request.feeTokenAmount} DL &middot; requested{' '}
                    {formatDateTime(request.createdAt)}
                  </p>
                </div>
              </div>
              <ActionButton
                className="min-h-10 shrink-0 rounded-lg bg-accent px-4 font-extrabold text-white"
                onClick={() => handleClaim(request.id)}
                pending={claiming && claimingId === request.id}
                pendingLabel="Claiming"
                type="button"
              >
                Claim
              </ActionButton>
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-3 text-sm font-bold">
          <button
            className="min-h-9 rounded-lg border border-line px-3 disabled:opacity-40"
            disabled={page <= 1 || loadingPending}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            type="button"
          >
            Previous
          </button>
          <span className="text-muted">
            Page {pendingPage?.page ?? page} of {totalPages}
          </span>
          <button
            className="min-h-9 rounded-lg border border-line px-3 disabled:opacity-40"
            disabled={page >= totalPages || loadingPending}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            type="button"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

/** One card per held claim -- a validator may hold several at once (admin-configurable via Integration.maxConcurrentClaims), each with its own independent code-entry form. */
function ClaimedRequestCard({ claim }: { claim: WhatsAppValidationClaim }) {
  const [verify, { isLoading: verifying }] = useVerifyWhatsAppValidationRequestMutation();
  const [reject, { isLoading: rejecting }] = useRejectWhatsAppValidationRequestMutation();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [verified, setVerified] = useState(false);

  async function handleVerify(event: FormEvent) {
    event.preventDefault();
    setError('');
    try {
      await verify({ id: claim.id, code: code.trim() }).unwrap();
      setVerified(true);
      setCode('');
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Invalid verification code.'));
    }
  }

  async function handleReject() {
    setError('');
    try {
      await reject(claim.id).unwrap();
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to release this request.'));
    }
  }

  if (verified) {
    return (
      <div className={`${cardClass} flex items-center gap-3 p-4`}>
        <CheckCircle2 className="size-6 shrink-0 text-success" aria-hidden="true" />
        <p className="font-bold">Verified. Your payout has been credited.</p>
      </div>
    );
  }

  return (
    <form className={`${cardClass} grid gap-3 p-5`} onSubmit={handleVerify}>
      <div className="flex items-center gap-2">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
          <MessageCircle className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="truncate font-black">
            <WhatsAppContactLink
              firstName={claim.requesterFirstName}
              lastName={claim.requesterLastName}
              phoneNumber={claim.phoneNumber}
            />
          </p>
          <p className="text-xs font-bold text-muted">
            Tap the name above to message this member on WhatsApp and ask for their code, then
            enter it below. Confirm their name matches before you verify.
          </p>
        </div>
      </div>
      {error && (
        <p className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm font-bold text-danger">
          {error}
        </p>
      )}
      <p className="text-sm font-extrabold">You'll earn {claim.feeTokenAmount} DL on success</p>
      <label className="grid gap-1.5 text-sm font-bold" htmlFor={`whatsapp-validate-code-${claim.id}`}>
        Code from the member
        <input
          className="min-h-11 rounded-lg border border-line bg-white px-3 text-center text-lg font-black tracking-[0.3em] dark:bg-surface-muted"
          id={`whatsapp-validate-code-${claim.id}`}
          inputMode="numeric"
          maxLength={6}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          placeholder="123456"
          value={code}
        />
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <ActionButton
          className="min-h-11 flex-1 rounded-lg bg-accent px-3 font-extrabold text-white disabled:opacity-50"
          disabled={code.trim().length !== 6}
          pending={verifying}
          pendingLabel="Verifying"
          type="submit"
        >
          Verify
        </ActionButton>
        <ActionButton
          className="min-h-11 rounded-lg border border-line px-3 font-extrabold hover:bg-surface-muted"
          onClick={handleReject}
          pending={rejecting}
          pendingLabel="Releasing"
          type="button"
        >
          <XCircle className="size-4" aria-hidden="true" /> Skip
        </ActionButton>
      </div>
    </form>
  );
}

function GetVerifiedTab() {
  const { data: myRequest, isLoading } = useGetMyWhatsAppValidationRequestQuery();
  const [requestVerification, { isLoading: requesting }] = useRequestWhatsAppValidationMutation();
  const [regenerateCode, { isLoading: regenerating }] = useRegenerateWhatsAppValidationCodeMutation();
  const [phoneNumber, setPhoneNumber] = useState('');
  const [error, setError] = useState('');
  const [issuedCode, setIssuedCode] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    try {
      const result = await requestVerification({ phoneNumber: phoneNumber.trim() }).unwrap();
      setIssuedCode(result.code);
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to request verification.'));
    }
  }

  async function handleRegenerate() {
    setError('');
    try {
      const result = await regenerateCode().unwrap();
      setIssuedCode(result.code);
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Unable to generate a new code.'));
    }
  }

  const activeRequest = myRequest && myRequest.status !== 'VERIFIED' ? myRequest : null;

  if (isLoading) {
    return <div className={`${cardClass} h-40 animate-pulse`} />;
  }

  // A live request already exists (PENDING or CLAIMED) -- show its status
  // instead of the request form, since only one request is allowed at a time.
  // issuedCode (set directly from the request-verification response) is
  // shown independent of activeRequest -- right after submit, the query
  // cache may not have caught up to the new PENDING row yet, but we
  // already have the code in hand and must not drop it from view while
  // waiting on a refetch.
  if (activeRequest) {
    return (
      <div className="grid gap-4">
        {error && (
          <p className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm font-bold text-danger">
            {error}
          </p>
        )}
        <div className={`${cardClass} grid gap-3 p-5`}>
          <div className="flex items-center justify-between gap-3">
            <p className="font-black">{activeRequest.phoneNumber}</p>
            <p className={`rounded-full px-2.5 py-1 text-xs font-black ${statusBadgeClass(activeRequest.status)}`}>
              {STATUS_LABELS[activeRequest.status]}
            </p>
          </div>
          {issuedCode ? (
            <div className="grid gap-1.5">
              <p className="text-sm text-muted">Use this code for peer verification:</p>
              <p className="justify-self-start rounded-lg bg-accent-soft px-4 py-3 text-center text-3xl font-black tracking-[0.3em] text-accent">
                {issuedCode}
              </p>
            </div>
          ) : (
            <div className="grid gap-2 rounded-lg border border-line bg-surface-muted p-3">
              <p className="text-sm text-muted">
                Your code was only shown once and can&apos;t be recovered. Generate a new one to
                continue.
              </p>
              <ActionButton
                className="min-h-10 justify-self-start rounded-lg bg-accent px-4 font-extrabold text-white"
                onClick={handleRegenerate}
                pending={regenerating}
                pendingLabel="Generating"
                type="button"
              >
                Generate new code
              </ActionButton>
            </div>
          )}
          {activeRequest.status === 'PENDING' && (
            <p className="text-sm text-muted">
              Your request is in the queue. A subscribed member will claim it and reach out to you on
              WhatsApp for your code.
            </p>
          )}
          {activeRequest.status === 'CLAIMED' && (
            <div className="grid gap-2">
              <p className="text-sm text-muted">
                A validator has claimed your request. Send them your code over WhatsApp -- if they
                haven't messaged you yet, you can reach out first. Only trust a message from this
                exact name and number:
              </p>
              {activeRequest.validatorPhoneNumber ? (
                <a
                  className="inline-flex w-fit items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 font-extrabold text-ink hover:bg-surface-muted dark:bg-surface-muted"
                  href={waLink(activeRequest.validatorPhoneNumber)}
                  rel="noreferrer"
                  target="_blank"
                >
                  <Phone className="size-4" aria-hidden="true" />{' '}
                  {formatContact(
                    activeRequest.validatorFirstName,
                    activeRequest.validatorLastName,
                    activeRequest.validatorPhoneNumber,
                  )}
                </a>
              ) : (
                <p className="text-sm font-bold text-muted">
                  The validator hasn't added a phone number yet -- wait for them to message you.
                </p>
              )}
            </div>
          )}
          <p className="text-sm font-extrabold">
            {activeRequest.feeTokenAmount} DL will be deducted from your balance once verified.
          </p>
          {issuedCode && (
            <ActionButton
              className="min-h-9 justify-self-start rounded-lg border border-line px-3 text-sm font-bold hover:bg-surface-muted"
              onClick={handleRegenerate}
              pending={regenerating}
              pendingLabel="Generating"
              type="button"
            >
              Generate a different code
            </ActionButton>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <form className={`${cardClass} grid gap-3 p-5`} onSubmit={handleSubmit}>
        <p className="text-sm text-muted">
          Enter your WhatsApp number. A subscribed member will pick up your request, message you on
          WhatsApp, and confirm your code to verify you.
        </p>
        {error && (
          <p className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm font-bold text-danger">
            {error}
          </p>
        )}
        <label className="grid gap-1.5 text-sm font-bold" htmlFor="whatsapp-request-phone">
          Phone number
          <input
            className="min-h-11 rounded-lg border border-line bg-white px-3 dark:bg-surface-muted"
            disabled={!!issuedCode}
            id="whatsapp-request-phone"
            onChange={(e) => setPhoneNumber(e.target.value)}
            placeholder="+2348012345678"
            required
            type="tel"
            value={phoneNumber}
          />
        </label>
        {issuedCode ? (
          <div className="grid gap-1.5">
            <p className="text-sm text-muted">Use this code for peer verification:</p>
            <p className="justify-self-start rounded-lg bg-accent-soft px-4 py-3 text-center text-3xl font-black tracking-[0.3em] text-accent">
              {issuedCode}
            </p>
            <p className="text-xs text-muted">
              Your request is now in the queue -- a subscribed member will claim it and message you
              on WhatsApp asking for this code.
            </p>
          </div>
        ) : (
          <ActionButton
            className="min-h-11 rounded-lg bg-accent px-3 font-extrabold text-white"
            pending={requesting}
            pendingLabel="Requesting"
            type="submit"
          >
            Request WhatsApp verification
          </ActionButton>
        )}
      </form>
    </div>
  );
}

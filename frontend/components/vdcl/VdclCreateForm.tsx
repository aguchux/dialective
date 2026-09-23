'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AlertCircle, ArrowLeft, ArrowRight } from 'lucide-react';
import { cardClass } from '@/components/dashboard/shared';
import { ActionButton } from '@/components/ui/ActionButton';
import { ConsentCards, CONSENT_WORDING_VERSION } from '@/components/vdcl/ConsentCards';
import { alertTone, primaryButton } from '@/components/vdcl/vdcl-ui';
import {
  normalizeErrorMessage,
  useGetMyVdclVersionsQuery,
  useGetVdclReadinessQuery,
  useStartVdclDraftMutation,
  type VdclPurpose,
} from '@/store/api';

/**
 * The permissions form, on its own route.
 *
 * Moved off the landing page deliberately. Seven separate legal choices
 * sitting underneath an explanation read as one continuous scroll, and
 * people fill in what is in front of them. Giving the decision its own
 * screen makes it an act rather than the bottom of a page.
 *
 * Readiness and in-flight state are re-checked HERE rather than trusted
 * from the landing page: this route is directly addressable, so anyone can
 * arrive at it without having passed through the explainer. The API
 * refuses regardless (startDraft re-runs readiness, createDraft refuses a
 * second in-flight version), so this is about showing an honest screen
 * rather than a form that can only fail on submit.
 */
export function VdclCreateForm() {
  const router = useRouter();
  const readiness = useGetVdclReadinessQuery();
  const versions = useGetMyVdclVersionsQuery();
  const [startDraft, startState] = useStartVdclDraftMutation();

  const [purposes, setPurposes] = useState<VdclPurpose[]>([]);
  const [error, setError] = useState<string | null>(null);

  const openVersion = versions.data?.find((v) =>
    ['DRAFT', 'PENDING_COMPILATION', 'PENDING_REVIEW', 'PENDING_COUNTERSIGNATURE'].includes(
      v.status,
    ),
  );
  const activeLicence = versions.data?.find((v) => v.status === 'ACTIVE');
  const nextVersionNumber = (activeLicence?.version ?? 0) + 1;

  async function handleStart() {
    setError(null);
    try {
      await startDraft({
        purposes,
        wordingVersion: CONSENT_WORDING_VERSION,
        locale: typeof navigator !== 'undefined' ? navigator.language : undefined,
      }).unwrap();
      // Back to the landing page: the tracker and sign panel live there, and
      // signing is the next thing that happens.
      router.push('/dashboard/licence');
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Could not start your licence.'));
    }
  }

  if (readiness.isLoading || versions.isLoading) {
    return (
      <div className={`${cardClass} grid place-items-center p-8`}>
        <p className="text-sm text-muted">Checking your account...</p>
      </div>
    );
  }

  // Someone who reached this URL without being able to finish should be told
  // why, not handed a form that will be refused on submit.
  if (readiness.data && !readiness.data.ready) {
    return (
      <Blocked
        detail="A licence is a legal document naming you, and a few account details are still missing. The licence page lists them."
        title="Your account is not ready yet"
      />
    );
  }

  if (openVersion) {
    return (
      <Blocked
        detail={`Version ${openVersion.version} is already in progress. Finish signing it before starting another — two in-flight versions would mean two different answers to what your licence covers.`}
        title="You already have a licence in progress"
      />
    );
  }

  return (
    <div className="grid gap-6">
      <div>
        <Link
          className="inline-flex items-center gap-1.5 text-sm font-bold text-muted hover:text-accent"
          href="/dashboard/licence"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to your licence
        </Link>
        <h1 className="mt-3 text-3xl font-black leading-tight text-ink">
          {activeLicence ? 'Update your licence' : 'Create your licence'}
        </h1>
        <p className="mt-2 max-w-2xl leading-relaxed text-muted">
          Choose what your recordings may be used for. Each use is a separate permission, and
          anything you leave unticked is not granted.
        </p>
      </div>

      {error ? (
        <p
          className={`flex items-start gap-2 rounded-lg px-3.5 py-3 text-sm font-bold ${alertTone.danger}`}
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}

      <section className={`${cardClass} p-5`}>
        {/* A signed manifest is immutable, so an update is a new version
            rather than an edit. Saying so here stops it reading as though
            the licence they already hold is about to change under them. */}
        {activeLicence ? (
          <p
            className={`mb-4 flex items-start gap-2 rounded-lg px-3.5 py-3 text-sm ${alertTone.neutral}`}
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>
              This creates{' '}
              <strong className="font-bold text-ink">version {nextVersionNumber}</strong> of your
              licence. Your current licence stays in force until Dialect Library countersigns the
              new one.
            </span>
          </p>
        ) : null}

        <h2 className="text-lg font-black text-ink">What may your recordings be used for?</h2>
        <p className="mt-1 text-sm leading-relaxed text-muted">
          Pick each use you are willing to allow. You can withdraw the whole licence later.
        </p>

        <div className="mt-4">
          <ConsentCards selected={purposes} onChange={setPurposes} />
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-line pt-5">
          <ActionButton
            className={primaryButton}
            disabled={purposes.length === 0 || startState.isLoading}
            onClick={handleStart}
            pending={startState.isLoading}
            pendingLabel="Preparing your licence..."
          >
            <span className="inline-flex items-center gap-2">
              Prepare my licence
              <ArrowRight className="size-4" aria-hidden="true" />
            </span>
          </ActionButton>
          <p className="text-sm text-muted">
            {purposes.length === 0
              ? 'Choose at least one use to continue.'
              : `${purposes.length} use${purposes.length === 1 ? '' : 's'} selected. You will review everything before signing.`}
          </p>
        </div>
      </section>
    </div>
  );
}

function Blocked({ title, detail }: { title: string; detail: string }) {
  return (
    <section className={`${cardClass} p-6`}>
      <h1 className="flex items-center gap-2 text-xl font-black text-ink">
        <AlertCircle className="size-5 text-warning" aria-hidden="true" />
        {title}
      </h1>
      <p className="mt-2 leading-relaxed text-muted">{detail}</p>
      <Link
        className={`mt-5 inline-flex items-center gap-2 ${primaryButton} px-5 py-2.5`}
        href="/dashboard/licence"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to your licence
      </Link>
    </section>
  );
}

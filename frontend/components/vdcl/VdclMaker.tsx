'use client';

import { useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  AudioWaveform,
  BadgeCheck,
  CircleDot,
  Clock,
  FileSignature,
  Gauge,
  Mic,
  Pencil,
  ShieldCheck,
} from 'lucide-react';
import { cardClass } from '@/components/dashboard/shared';
import { ActionButton } from '@/components/ui/ActionButton';
import { ConsentCards, CONSENT_WORDING_VERSION } from '@/components/vdcl/ConsentCards';
import { VdclSignPanel } from '@/components/vdcl/VdclSignPanel';
import { VdclTracker } from '@/components/vdcl/VdclTracker';
import { VdclDocuments } from '@/components/vdcl/VdclDocuments';
import { alertTone, primaryButton, secondaryButton } from '@/components/vdcl/vdcl-ui';
import {
  normalizeErrorMessage,
  useGetMyVdclVersionsQuery,
  useGetVdclReadinessQuery,
  useStartVdclDraftMutation,
  type VdclPurpose,
} from '@/store/api';

function formatDuration(ms: string | null | undefined): string {
  const value = Number(ms ?? 0);
  if (!Number.isFinite(value) || value <= 0) return '0m';
  const hours = Math.floor(value / 3_600_000);
  const minutes = Math.floor((value % 3_600_000) / 60_000);
  const seconds = Math.floor((value % 60_000) / 1000);
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}

const EXCLUSION_LABELS: Record<string, string> = {
  not_yet_scored: 'Still being scored — these will be picked up later',
  audio_purged: 'Audio was deleted under the retention policy',
  rejected_by_quality_gate: 'Rejected at recording for length, silence or unclear audio',
  expired_unscored: 'Timed out before scoring',
  misplaced_dialect: 'Flagged as a different dialect',
  no_audio_flagged: 'Reported as having no audible content',
};

/**
 * The VDCL Maker.
 *
 * A contributor's route from "I record for Dialect Library" to "I have
 * licensed my recordings, on terms I chose". The order is deliberate and
 * matches the plan: readiness first, so nobody enters a flow they cannot
 * finish; then the permissions, each chosen separately; then the exact
 * dataset; then the signature.
 *
 * This is the most consequential thing a contributor does on the platform,
 * and the page is built to read that way -- a stated hero, their own
 * numbers up front, and one clear action at a time. A flat stack of
 * checkboxes would make seven separate legal decisions look like a
 * preferences form.
 */
export function VdclMaker() {
  const readiness = useGetVdclReadinessQuery();
  const versions = useGetMyVdclVersionsQuery();
  const [startDraft, startState] = useStartVdclDraftMutation();

  const [purposes, setPurposes] = useState<VdclPurpose[]>([]);
  const [activeVersionId, setActiveVersionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The consent form is opt-in, not the landing state. Opening straight
  // onto seven legal choices presents the decision before any of the
  // context that makes it answerable -- what the licence covers, what is
  // excluded, what it would apply to. The hero CTA is what reveals it.
  const [formOpen, setFormOpen] = useState(false);

  const openVersion = versions.data?.find((v) =>
    ['DRAFT', 'PENDING_COMPILATION', 'PENDING_REVIEW', 'PENDING_COUNTERSIGNATURE'].includes(
      v.status,
    ),
  );
  const activeLicence = versions.data?.find((v) => v.status === 'ACTIVE');
  const current = activeVersionId ?? openVersion?.versionId ?? null;
  /**
   * Whether a NEW version may be started. Deliberately does not exclude an
   * active licence: compileVersion refuses to mutate a signed manifest, so
   * changing what a licence covers means drafting a new version, and
   * createDraft supports exactly that. The only real bar is a version
   * already in flight -- two would mean two answers to "what does this
   * licence cover" racing to be signed, which createDraft also refuses.
   */
  const canStart = Boolean(readiness.data?.ready && !openVersion);

  /**
   * The licence is only viewable once BOTH signatures exist.
   *
   * Countersignature is what actually grants rights and what triggers
   * document issue -- before it, a signed licence permits nothing and the
   * PDF/PNG do not exist yet. Offering a View button any earlier would open
   * a panel whose downloads can only fail. ACTIVE is checked as well as the
   * timestamps so a suspended or withdrawn licence does not present itself
   * as one in force.
   */
  const viewableLicence =
    activeLicence && activeLicence.signedAt && activeLicence.countersignedAt
      ? activeLicence
      : null;

  /**
   * Three states, one button:
   *   nothing started      -> "Create your VDCL"
   *   started, not finished -> "Complete your VDCL"
   *   in force             -> "Update your VDCL" (a new version; the
   *                            existing one is immutable, so this never
   *                            edits a licence already signed)
   *
   * Wording follows what the contributor has actually done, so a half-
   * finished licence never asks them to "create" something they already
   * started and would lose.
   */
  const ctaMode: 'create' | 'complete' | 'update' = activeLicence
    ? 'update'
    : openVersion
      ? 'complete'
      : 'create';
  const ctaLabel =
    ctaMode === 'create'
      ? 'Create your VDCL'
      : ctaMode === 'complete'
        ? 'Complete your VDCL'
        : 'Update your VDCL';

  /**
   * Where the CTA sends them. "Complete" has an open version whose next
   * step is already on the page (the tracker and sign panel), so it scrolls
   * rather than opening the consent form -- re-picking purposes would
   * discard work in progress. "Create" and "Update" both start a new
   * version, which begins with the purposes.
   */
  function handleCta() {
    if (ctaMode === 'complete') {
      if (openVersion) setActiveVersionId(openVersion.versionId);
      document.getElementById('vdcl-progress')?.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    setFormOpen(true);
    // Deferred a frame so the section exists before we scroll to it.
    requestAnimationFrame(() =>
      document.getElementById('vdcl-consent')?.scrollIntoView({ behavior: 'smooth' }),
    );
  }

  async function handleStart() {
    setError(null);
    try {
      const result = await startDraft({
        purposes,
        wordingVersion: CONSENT_WORDING_VERSION,
        locale: typeof navigator !== 'undefined' ? navigator.language : undefined,
      }).unwrap();
      setActiveVersionId(result.versionId);
    } catch (err) {
      setError(normalizeErrorMessage(err, 'Could not start your licence.'));
    }
  }

  return (
    <div className="grid gap-6">
      {/* The hero states what this is and what it costs the contributor to
          agree, in their own terms. Withdrawal being prospective is the one
          thing the plan insists must not be buried in a PDF clause, so it
          is in the opening paragraph. */}
      <header className="overflow-hidden rounded-2xl border border-accent/25 bg-linear-to-br from-accent-soft to-surface p-6 md:p-8">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-xs font-black uppercase tracking-wide text-white">
          <FileSignature className="size-3.5" aria-hidden="true" />
          Contributor licence
        </span>
        <h1 className="mt-3 text-3xl font-black leading-tight text-ink md:text-4xl">
          Your voice, licensed on your terms
        </h1>
        <p className="mt-2.5 max-w-2xl leading-relaxed text-muted">
          A VDCL is your permission for Dialect Library to license your recordings to the
          organisations that train speech models. You choose what it may be used for, and you can
          withdraw it at any time — though withdrawal stops future use, it cannot pull back a model
          already trained.
        </p>
        <p className="mt-3 inline-flex items-center gap-2 text-sm font-bold text-accent">
          <ShieldCheck className="size-4" aria-hidden="true" />
          Your name is never shared with the organisations that license your recordings.
        </p>

        {/* The page's one action, in the hero rather than below the fold.
            The View button appears beside it only once the licence is
            genuinely in force -- see viewableLicence. */}
        {readiness.data ? (
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <ActionButton
              onClick={handleCta}
              disabled={!readiness.data.ready}
              className={primaryButton}
            >
              <span className="inline-flex items-center gap-2">
                {ctaMode === 'update' ? (
                  <Pencil className="size-4" aria-hidden="true" />
                ) : (
                  <FileSignature className="size-4" aria-hidden="true" />
                )}
                {ctaLabel}
                <ArrowRight className="size-4" aria-hidden="true" />
              </span>
            </ActionButton>

            {viewableLicence ? (
              <a
                className={`inline-flex items-center ${secondaryButton}`}
                href="#vdcl-documents"
                onClick={(e) => {
                  e.preventDefault();
                  document
                    .getElementById('vdcl-documents')
                    ?.scrollIntoView({ behavior: 'smooth' });
                }}
              >
                <span className="inline-flex items-center gap-2">
                  <ShieldCheck className="size-4" aria-hidden="true" />
                  View your licence
                </span>
              </a>
            ) : null}

            {!readiness.data.ready ? (
              <p className="text-sm text-muted">
                A few account details are needed first — see below.
              </p>
            ) : null}
          </div>
        ) : null}
      </header>

      {error ? (
        <p
          className={`flex items-start gap-2 rounded-lg px-3.5 py-3 text-sm font-bold ${alertTone.danger}`}
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}

      {readiness.isLoading ? (
        <div className={`${cardClass} grid place-items-center p-8`}>
          <p className="text-sm text-muted">Checking your account...</p>
        </div>
      ) : null}

      {/* Readiness first: nobody should reach a signature screen they are
          not entitled to complete. */}
      {readiness.data && !readiness.data.ready ? (
        <section className={`${cardClass} p-5`}>
          <h2 className="flex items-center gap-2 text-lg font-black text-ink">
            <CircleDot className="size-4.5 text-warning" aria-hidden="true" />
            Before you can sign
          </h2>
          <p className="mt-1 text-sm text-muted">
            A licence is a legal document naming you, so a few things have to be in place first.
          </p>
          <ul className="mt-4 grid gap-2.5">
            {readiness.data.blockers.map((blocker) => (
              <li
                key={blocker.requirement}
                className="flex items-start gap-3 rounded-lg border border-line bg-surface-muted px-3.5 py-3"
              >
                <span
                  aria-hidden="true"
                  className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full ${
                    blocker.actionable ? 'bg-warning/15 text-warning' : 'bg-line text-muted'
                  }`}
                >
                  {blocker.actionable ? (
                    <AlertCircle className="size-3.5" />
                  ) : (
                    <Clock className="size-3.5" />
                  )}
                </span>
                <span className="grid gap-0.5">
                  <span className="font-bold text-ink">{blocker.requirement}</span>
                  <span className="text-sm leading-relaxed text-muted">{blocker.detail}</span>
                  {!blocker.actionable ? (
                    <span className="mt-0.5 text-xs font-bold text-muted">
                      With Dialect Library — nothing for you to do right now.
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {readiness.data?.inventory ? (
        <section className={`${cardClass} p-5`}>
          <h2 className="text-lg font-black text-ink">What a licence would cover today</h2>
          <p className="mt-1 text-sm text-muted">
            Your eligible recordings in {readiness.data.dialectTag ?? 'your dialect'}, as they
            stand right now.
          </p>
          <dl className="mt-4 grid gap-3 sm:grid-cols-3">
            <Stat
              icon={Mic}
              label="Recordings"
              value={String(readiness.data.inventory.eligibleCount)}
            />
            <Stat
              icon={AudioWaveform}
              label="Audio"
              value={formatDuration(readiness.data.inventory.totalDurationMs)}
            />
            <Stat
              icon={Gauge}
              label="Average quality"
              value={
                readiness.data.inventory.meanCompositeScore !== null
                  ? `${readiness.data.inventory.meanCompositeScore}`
                  : '—'
              }
              suffix={readiness.data.inventory.meanCompositeScore !== null ? '/ 100' : undefined}
            />
          </dl>
          {Object.keys(readiness.data.inventory.exclusionsByReason).length > 0 ? (
            <details className="group mt-4 rounded-lg border border-line bg-surface-muted px-3.5 py-3">
              <summary className="cursor-pointer text-sm font-bold text-ink marker:content-['']">
                <span className="inline-flex items-center gap-1.5">
                  <ArrowRight
                    className="size-3.5 transition-transform group-open:rotate-90"
                    aria-hidden="true"
                  />
                  {readiness.data.inventory.excludedCount} recording(s) would not be included
                </span>
              </summary>
              <ul className="mt-3 grid gap-2">
                {Object.entries(readiness.data.inventory.exclusionsByReason).map(
                  ([reason, count]) => (
                    <li key={reason} className="flex items-baseline gap-2 text-sm text-muted">
                      <span className="min-w-8 rounded bg-surface px-1.5 text-center font-black text-ink">
                        {count}
                      </span>
                      {EXCLUSION_LABELS[reason] ?? reason}
                    </li>
                  ),
                )}
              </ul>
            </details>
          ) : null}
        </section>
      ) : null}

      {activeLicence ? (
        <>
          <section className="rounded-xl border border-accent/30 bg-accent-soft p-5">
            <h2 className="flex items-center gap-2 text-lg font-black text-accent">
              <BadgeCheck className="size-5" aria-hidden="true" />
              Your licence is active
            </h2>
            <p className="mt-1 text-sm text-muted">
              <span className="font-mono font-bold text-ink">{activeLicence.licenceKey}</span>{' '}
              covers {activeLicence.recordingCount ?? 0} recordings.
            </p>
          </section>
          <div id="vdcl-documents">
            <VdclDocuments versionId={activeLicence.versionId} />
          </div>
        </>
      ) : null}

      {/* Permissions before the signature, each one a separate choice --
          never a single "accept everything" box. */}
      {canStart && formOpen ? (
        <section className={`${cardClass} p-5`} id="vdcl-consent">
          <h2 className="text-lg font-black text-ink">What may your recordings be used for?</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            Pick each use you are willing to allow. Anything you leave unticked is not permitted,
            and you can withdraw the whole licence later.
          </p>
          {/* A signed manifest is immutable, so an update is a new version
              rather than an edit. Saying so here stops it reading as though
              the licence they already hold is about to change under them. */}
          {activeLicence ? (
            <p
              className={`mt-3 flex items-start gap-2 rounded-lg px-3.5 py-3 text-sm ${alertTone.neutral}`}
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>
                This creates <strong className="font-bold text-ink">version {' '}
                {(activeLicence.version ?? 0) + 1}</strong> of your licence. Your current licence
                stays in force until Dialect Library countersigns the new one.
              </span>
            </p>
          ) : null}

          <div className="mt-4">
            <ConsentCards selected={purposes} onChange={setPurposes} />
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-line pt-5">
            <ActionButton
              onClick={handleStart}
              disabled={purposes.length === 0 || startState.isLoading}
              pending={startState.isLoading}
              pendingLabel="Preparing your licence..."
              className={primaryButton}
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
      ) : null}

      {current ? (
        <div className="grid gap-6" id="vdcl-progress">
          <VdclTracker versionId={current} />
          <VdclSignPanel versionId={current} />
        </div>
      ) : null}

      {versions.data && versions.data.length > 0 ? (
        <section className={`${cardClass} p-5`}>
          <h2 className="text-lg font-black text-ink">Your licence history</h2>
          <ul className="mt-3 grid gap-2">
            {versions.data.map((v) => (
              <li key={v.versionId}>
                <button
                  type="button"
                  onClick={() => setActiveVersionId(v.versionId)}
                  className={`flex w-full flex-wrap items-center justify-between gap-2 rounded-lg border px-3.5 py-3 text-left transition-colors hover:border-accent ${
                    current === v.versionId ? 'border-accent bg-accent-soft' : 'border-line'
                  }`}
                >
                  <span className="grid gap-0.5">
                    <span className="font-mono text-sm font-bold text-ink">
                      {v.licenceKey}
                      <span className="ml-1.5 font-sans text-muted">v{v.version}</span>
                    </span>
                    <span className="text-xs text-muted">
                      {v.recordingCount !== null
                        ? `${v.recordingCount} recordings`
                        : 'not yet compiled'}
                    </span>
                  </span>
                  <StatusPill status={v.status} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  suffix,
}: {
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>;
  label: string;
  value: string;
  suffix?: string;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface-muted p-3.5">
      <dt className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted">
        <Icon className="size-3.5" aria-hidden="true" />
        {label}
      </dt>
      <dd className="mt-1.5 text-2xl font-black tabular-nums text-ink">
        {value}
        {suffix ? <span className="ml-1 text-sm font-bold text-muted">{suffix}</span> : null}
      </dd>
    </div>
  );
}

/** Status tones follow meaning, not decoration: accent = in force. */
function StatusPill({ status }: { status: string }) {
  const tone =
    status === 'ACTIVE'
      ? 'bg-accent text-white'
      : status === 'WITHDRAWN' || status === 'REJECTED'
        ? 'bg-danger/15 text-danger'
        : status === 'SUSPENDED'
          ? 'bg-warning/15 text-warning'
          : 'bg-surface-muted text-muted';
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-black uppercase tracking-wide ${tone}`}>
      {status.replace(/_/g, ' ').toLowerCase()}
    </span>
  );
}

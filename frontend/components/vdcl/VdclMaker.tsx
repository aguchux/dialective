'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  ArrowRight,
  AudioWaveform,
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
import { VdclExplainer } from '@/components/vdcl/VdclExplainer';
import { VdclSignPanel } from '@/components/vdcl/VdclSignPanel';
import { VdclTracker } from '@/components/vdcl/VdclTracker';
import { VdclCertificate } from '@/components/vdcl/VdclCertificate';
import { primaryButton, secondaryButton } from '@/components/vdcl/vdcl-ui';
import { useGetMyVdclVersionsQuery, useGetVdclReadinessQuery } from '@/store/api';

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
 * The VDCL landing page.
 *
 * This screen explains and reports; it never collects. A contributor
 * arrives knowing nothing about what a VDCL is, so the page opens on the
 * explainer, and the CTA stays disabled until they have paged through it
 * and confirmed they understand. Choosing permissions happens on a
 * separate route (/dashboard/licence/create), because seven legal choices
 * presented underneath an explanation read as part of the same scroll --
 * people fill in what is in front of them.
 *
 * Everything else here is status: what a licence would cover, where an
 * in-flight one has got to, and the certificate once it is in force.
 */
export function VdclMaker() {
  const router = useRouter();
  const readiness = useGetVdclReadinessQuery();
  const versions = useGetMyVdclVersionsQuery();

  const [acknowledged, setAcknowledged] = useState(false);
  const [activeVersionId, setActiveVersionId] = useState<string | null>(null);

  const openVersion = versions.data?.find((v) =>
    ['DRAFT', 'PENDING_COMPILATION', 'PENDING_REVIEW', 'PENDING_COUNTERSIGNATURE'].includes(
      v.status,
    ),
  );
  const activeLicence = versions.data?.find((v) => v.status === 'ACTIVE');
  const current = activeVersionId ?? openVersion?.versionId ?? null;

  /**
   * The licence is only viewable once BOTH signatures exist.
   *
   * Countersignature is what grants rights and what triggers document
   * issue -- before it the PDF and PNG do not exist, so an earlier View
   * button would open downloads that can only fail. Status is checked
   * alongside the timestamps so a suspended or withdrawn licence never
   * presents itself as one in force.
   */
  const viewableLicence =
    activeLicence && activeLicence.signedAt && activeLicence.countersignedAt ? activeLicence : null;

  /**
   * Three states, one button. Wording follows what the contributor has
   * actually done, so a half-finished licence never asks them to "create"
   * something they already started and would lose.
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
   * "Complete" has a version already in flight whose next step is on this
   * page (the tracker and sign panel), so it scrolls rather than routing to
   * the form -- re-picking purposes would discard work in progress. It also
   * skips the acknowledgement gate, since that was passed to create it.
   */
  const needsAcknowledgement = ctaMode !== 'complete';
  const ctaEnabled =
    Boolean(readiness.data?.ready) && (!needsAcknowledgement || acknowledged);

  function handleCta() {
    if (ctaMode === 'complete') {
      if (openVersion) setActiveVersionId(openVersion.versionId);
      document.getElementById('vdcl-progress')?.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    router.push('/dashboard/licence/create');
  }

  return (
    <div className="grid gap-6">
      {/* The explainer comes FIRST, above the hero. Nobody should meet the
          control before the explanation of what it commits them to. It is
          skipped once a version is already in flight -- they have read it. */}
      {needsAcknowledgement ? (
        <VdclExplainer acknowledged={acknowledged} onAcknowledge={setAcknowledged} />
      ) : null}

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

        {readiness.data ? (
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <ActionButton onClick={handleCta} disabled={!ctaEnabled} className={primaryButton}>
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
                href="#vdcl-certificate"
                onClick={(e) => {
                  e.preventDefault();
                  document.getElementById('vdcl-certificate')?.scrollIntoView({
                    behavior: 'smooth',
                  });
                }}
              >
                <span className="inline-flex items-center gap-2">
                  <ShieldCheck className="size-4" aria-hidden="true" />
                  View your licence
                </span>
              </a>
            ) : null}

            {/* Says WHY it is disabled. A greyed-out button with no reason
                is the most common way a flow silently dead-ends. */}
            {!readiness.data.ready ? (
              <p className="text-sm text-muted">
                A few account details are needed first — see below.
              </p>
            ) : !ctaEnabled ? (
              <p className="text-sm text-muted">
                Read the cards above and confirm you understand to continue.
              </p>
            ) : null}
          </div>
        ) : null}
      </header>

      {readiness.isLoading ? (
        <div className={`${cardClass} grid place-items-center p-8`}>
          <p className="text-sm text-muted">Checking your account...</p>
        </div>
      ) : null}

      {/* Readiness: nobody should reach a signature screen they are not
          entitled to complete. */}
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
            {readiness.data.dialectTags.length > 0
              ? `Your eligible recordings in ${readiness.data.dialectTags.join(', ')}, as they stand right now.`
              : 'Your eligible recordings, as they stand right now.'}{' '}
            One licence covers every dialect you record in.
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

      {viewableLicence ? <VdclCertificate licence={viewableLicence} /> : null}

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

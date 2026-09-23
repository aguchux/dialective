'use client';

import { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Building2,
  Coins,
  FileSignature,
  ShieldCheck,
  Undo2,
} from 'lucide-react';
import { cardClass } from '@/components/dashboard/shared';
import { primaryButton, secondaryButton } from '@/components/vdcl/vdcl-ui';

/**
 * Bump when the substance of a slide changes.
 *
 * Stored alongside the contributor's acknowledgement so "they confirmed
 * they understood" can always be resolved to the exact words they were
 * shown -- the same reasoning as CONSENT_WORDING_VERSION on the grants
 * themselves. An acknowledgement that cannot be tied to specific wording
 * is not evidence of anything.
 */
export const VDCL_EXPLAINER_VERSION = 'vdcl-explainer-1.0';

interface Slide {
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>;
  title: string;
  body: string;
}

/**
 * What a VDCL is, before anyone is asked to grant one.
 *
 * Ordered by what a contributor needs in order to decide, not by what is
 * easiest to say. The two facts that constrain them for good -- withdrawal
 * being prospective only, and a trained model being unrecoverable -- are
 * slide four, before the confirmation, never in a PDF clause afterwards.
 */
const SLIDES: Slide[] = [
  {
    icon: FileSignature,
    title: 'What a VDCL is',
    body: 'A Voice Dataset Contributor Licence is your written permission for Dialect Library to license the recordings you have already made to organisations that train speech models. It does not give away ownership of your voice. It is a permission, granted by you, on terms you choose.',
  },
  {
    icon: Building2,
    title: 'Who receives your recordings',
    body: 'Subscribing organisations — companies and research groups building speech recognition, synthesis and language technology. They receive your audio and its transcript. They never receive your name, your phone number, your email or your photo. Dialect Library sits in the middle and is the only party that sees both sides.',
  },
  {
    icon: ShieldCheck,
    title: 'You choose each use separately',
    body: 'Speech recognition, speech synthesis, research, onward licensing, promotion and speaker identification are each a separate decision. There is no accept-all. Anything you leave unticked is not permitted, and some uses — such as voice cloning — are not offered at all.',
  },
  {
    icon: Undo2,
    title: 'Withdrawal stops the future, not the past',
    body: 'You can withdraw your licence at any time and organisations must stop using your recordings for anything new. But a model already trained on them cannot be untrained, and copies already distributed under the licence cannot be recalled. This is the part worth being sure about before you sign.',
  },
  {
    icon: Coins,
    title: 'What you get',
    body: 'Your recordings become licensable rather than sitting unused, and you receive a signed licence document and a verifiable certificate. The certificate carries a QR code anyone can scan to confirm the licence is genuine — it shows the licence status and dataset size, never your identity.',
  },
];

/**
 * The explainer carousel that gates the licence CTA.
 *
 * A contributor grants commercial rights over their own voice here, so the
 * page opens on an explanation rather than on a control. The confirmation
 * is on the LAST slide only, reachable solely by paging through, so
 * "I understand" cannot be ticked from the first screen without the four
 * slides before it having been displayed.
 *
 * This is an honest reading gate, not a legal one: it proves the material
 * was put in front of someone, which is the most any interface can do. It
 * deliberately does not try to enforce comprehension with a timer or a
 * quiz, which would insult the reader without proving anything more.
 */
export function VdclExplainer({
  acknowledged,
  onAcknowledge,
}: {
  acknowledged: boolean;
  onAcknowledge: (value: boolean) => void;
}) {
  const [index, setIndex] = useState(0);
  // Monotonic: paging back to re-read must not re-lock the confirmation.
  const [reachedEnd, setReachedEnd] = useState(false);

  const slide = SLIDES[index];
  const last = index === SLIDES.length - 1;
  const Icon = slide.icon;

  function go(next: number) {
    const clamped = Math.min(Math.max(0, next), SLIDES.length - 1);
    setIndex(clamped);
    if (clamped === SLIDES.length - 1) setReachedEnd(true);
  }

  return (
    <section className={`${cardClass} overflow-hidden`} aria-labelledby="vdcl-explainer-title">
      <div className="border-b border-line px-5 py-3">
        <p className="text-xs font-black uppercase tracking-wide text-muted">
          Before you decide · {index + 1} of {SLIDES.length}
        </p>
      </div>

      <div className="p-5 md:p-6">
        <span
          aria-hidden="true"
          className="grid size-11 place-items-center rounded-xl bg-accent-soft text-accent"
        >
          <Icon className="size-5.5" />
        </span>
        <h2 className="mt-3.5 text-xl font-black text-ink" id="vdcl-explainer-title">
          {slide.title}
        </h2>
        {/* aria-live so a screen reader announces the new slide rather than
            leaving the reader on a page that silently changed under them. */}
        <p className="mt-2 min-h-24 leading-relaxed text-muted" aria-live="polite">
          {slide.body}
        </p>

        {/* Progress dots double as direct navigation -- someone who wants to
            re-read slide two should not have to page backwards to reach it. */}
        <div className="mt-5 flex items-center gap-1.5" role="tablist" aria-label="Slides">
          {SLIDES.map((s, i) => (
            <button
              aria-label={`Slide ${i + 1}: ${s.title}`}
              aria-selected={i === index}
              className={`h-1.5 rounded-full transition-all ${
                i === index ? 'w-6 bg-accent' : 'w-1.5 bg-line hover:bg-muted'
              }`}
              key={s.title}
              onClick={() => go(i)}
              role="tab"
              type="button"
            />
          ))}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2.5 border-t border-line pt-5">
          <button
            className={secondaryButton}
            disabled={index === 0}
            onClick={() => go(index - 1)}
            type="button"
          >
            <span className="inline-flex items-center gap-2">
              <ArrowLeft className="size-4" aria-hidden="true" />
              Back
            </span>
          </button>
          {!last ? (
            <button className={primaryButton} onClick={() => go(index + 1)} type="button">
              <span className="inline-flex items-center gap-2">
                Next
                <ArrowRight className="size-4" aria-hidden="true" />
              </span>
            </button>
          ) : null}
          {!last ? (
            <p className="text-sm text-muted">
              {SLIDES.length - index - 1} more to read before you can continue.
            </p>
          ) : null}
        </div>

        {/* The confirmation lives on the final slide only. Rendering it
            earlier -- even disabled -- would let it be ticked before the
            material it refers to had been shown. */}
        {last && reachedEnd ? (
          <label
            className={`mt-5 flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${
              acknowledged ? 'border-accent bg-accent-soft' : 'border-line hover:border-accent/50'
            }`}
          >
            <input
              checked={acknowledged}
              className="sr-only"
              onChange={(e) => onAcknowledge(e.target.checked)}
              type="checkbox"
            />
            <span
              aria-hidden="true"
              className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded border-2 ${
                acknowledged ? 'border-accent bg-accent text-white' : 'border-line bg-surface'
              }`}
            >
              {acknowledged ? <BadgeCheck className="size-3.5" strokeWidth={3} /> : null}
            </span>
            <span className="grid gap-0.5">
              <span className="font-bold text-ink">
                I have read this and understand what a VDCL means.
              </span>
              <span className="text-sm leading-relaxed text-muted">
                In particular, that withdrawing my licence stops future use but cannot untrain a
                model or recall copies already distributed.
              </span>
            </span>
          </label>
        ) : null}
      </div>
    </section>
  );
}

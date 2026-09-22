'use client';

import { useState } from 'react';
import {
  AudioLines,
  Check,
  ChevronDown,
  Fingerprint,
  GraduationCap,
  Megaphone,
  MessageSquareText,
  Share2,
  ShieldAlert,
  Speech,
} from 'lucide-react';
import type { VdclPurpose } from '@/store/api';

/**
 * The wording version recorded against every grant.
 *
 * Bump this whenever the copy below changes in a way that alters what a
 * contributor is agreeing to. It is stored per grant, so a licence can
 * always be traced back to the exact words the person read -- which is the
 * only way to answer "what did they actually consent to?" later.
 */
export const CONSENT_WORDING_VERSION = 'vdcl-consent-1.0';

interface ConsentCard {
  purpose: VdclPurpose;
  title: string;
  summary: string;
  learnMore: string;
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>;
  /** Sensitive uses are visually separated and never pre-selected. */
  sensitive?: boolean;
}

/**
 * Plain-language consent cards.
 *
 * Two rules from the product plan are structural here, not cosmetic:
 *
 * 1. Each use is its own choice. There is no "accept all" control, because
 *    a single checkbox covering several uses is not informed consent to any
 *    of them.
 *
 * 2. Sensitive processing is never hidden inside a general option.
 *    Biometric use, redistribution and promotional use are listed
 *    separately, marked, and explained in their own words.
 *
 * Voice cloning is absent entirely. It is not offered in v1 -- and the API
 * refuses it too, so this is a presentation of that policy rather than the
 * policy itself.
 *
 * Visually, a ticked card takes the accent border and tint used by every
 * other selectable card in the product (see admin/CurrencyPicker). That
 * matters beyond looks: the contributor needs to see at a glance which
 * permissions they are about to grant, and an unstyled checkbox row makes
 * seven separate decisions read as one undifferentiated form.
 */
const CARDS: ConsentCard[] = [
  {
    purpose: 'ASR_TRAINING',
    title: 'Speech recognition',
    summary: 'Train systems that turn speech into text in your dialect.',
    icon: Speech,
    learnMore:
      'Your recordings and their transcripts are used to teach models to understand your dialect. This is the main reason Dialect Library collects voice data, and it is what most subscribing organisations are after.',
  },
  {
    purpose: 'TTS_TRAINING',
    title: 'Speech synthesis',
    summary: 'Train systems that read text aloud in your dialect.',
    icon: AudioLines,
    learnMore:
      'A synthesis model learns general patterns of how your dialect sounds. It is not trained to reproduce your specific voice — that would be voice cloning, which Dialect Library does not offer and this licence never permits.',
  },
  {
    purpose: 'LLM_TRAINING',
    title: 'Language model training',
    summary: 'Use the text of your transcripts to train language models.',
    icon: MessageSquareText,
    learnMore:
      'This covers the written transcripts rather than the audio. Text in under-represented dialects is scarce, and this is how those dialects reach the models people use every day.',
  },
  {
    purpose: 'LINGUISTIC_RESEARCH',
    title: 'Academic research',
    summary: 'Allow universities and researchers to study your dialect.',
    icon: GraduationCap,
    learnMore:
      'Non-commercial research into how your dialect is spoken, how it varies by region, and how it is changing. Researchers get the same anonymised access as anyone else — they never learn who recorded what.',
  },
  {
    purpose: 'DATASET_REDISTRIBUTION',
    title: 'Onward licensing',
    summary:
      'Allow an organisation that licenses your recordings to license them on to others.',
    icon: Share2,
    learnMore:
      'Without this, a subscriber may only use your recordings themselves. With it, they may include them in datasets they license onward — which reaches further, but means Dialect Library has less direct sight of where your recordings end up. You can decline this and still allow everything else.',
    sensitive: true,
  },
  {
    purpose: 'PUBLIC_PROMOTION',
    title: 'Demos and marketing',
    summary: 'Allow short clips of your recordings to be played publicly.',
    icon: Megaphone,
    learnMore:
      'Clips may appear in demonstrations, conference talks or marketing material showing what the dataset sounds like. Your name is never attached, but your voice would be audible to the public rather than only used inside a training pipeline.',
    sensitive: true,
  },
  {
    purpose: 'BIOMETRIC_PROCESSING',
    title: 'Speaker identification',
    summary: 'Allow processing that can tell one speaker apart from another.',
    icon: Fingerprint,
    learnMore:
      'Voiceprint and speaker-identification work treats your voice as something that identifies you, which is why it is regulated separately from ordinary speech data in many countries. Declining this does not affect any of the other uses. If you are unsure, leave it unticked — it is the most restrictive choice and you can grant it later in a new version.',
    sensitive: true,
  },
];

export function ConsentCards({
  selected,
  onChange,
}: {
  selected: VdclPurpose[];
  onChange: (next: VdclPurpose[]) => void;
}) {
  const [expanded, setExpanded] = useState<VdclPurpose | null>(null);

  function toggle(purpose: VdclPurpose) {
    onChange(
      selected.includes(purpose)
        ? selected.filter((p) => p !== purpose)
        : [...selected, purpose],
    );
  }

  const standard = CARDS.filter((c) => !c.sensitive);
  const sensitive = CARDS.filter((c) => c.sensitive);

  return (
    <div className="grid gap-5">
      <div className="grid gap-2.5">
        {standard.map((card) => (
          <Card
            key={card.purpose}
            card={card}
            checked={selected.includes(card.purpose)}
            expanded={expanded === card.purpose}
            onToggle={() => toggle(card.purpose)}
            onExpand={() =>
              setExpanded(expanded === card.purpose ? null : card.purpose)
            }
          />
        ))}
      </div>

      {/* Sensitive uses get their own bordered region, not just a badge in
          a flat list. An earlier pass tinted their border at 35% opacity and
          it was invisible on screen -- which defeated the separation
          entirely. A contributor skimming has to register that they are
          entering different territory BEFORE they start ticking. */}
      <div className="grid gap-2.5 rounded-xl border border-warning/50 bg-warning/[0.06] p-3.5">
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="grid size-7 place-items-center rounded-lg bg-warning/15 text-warning"
          >
            <ShieldAlert className="size-4" />
          </span>
          <h3 className="text-sm font-black uppercase tracking-wide text-warning">
            Worth reading closely
          </h3>
        </div>
        <p className="-mt-0.5 text-sm leading-relaxed text-muted">
          These three go further than training a model on your speech. Each is optional on its
          own, and declining any of them does not affect the others.
        </p>
        {sensitive.map((card) => (
          <Card
            key={card.purpose}
            card={card}
            checked={selected.includes(card.purpose)}
            expanded={expanded === card.purpose}
            onToggle={() => toggle(card.purpose)}
            onExpand={() =>
              setExpanded(expanded === card.purpose ? null : card.purpose)
            }
          />
        ))}
      </div>

      <p className="rounded-lg border border-line bg-surface-muted px-3 py-2.5 text-sm text-muted">
        <strong className="font-bold text-ink">Voice cloning is never offered.</strong> Making a
        synthetic copy of your specific voice cannot be granted through this licence, whatever you
        tick above.
      </p>
    </div>
  );
}

function Card({
  card,
  checked,
  expanded,
  onToggle,
  onExpand,
}: {
  card: ConsentCard;
  checked: boolean;
  expanded: boolean;
  onToggle: () => void;
  onExpand: () => void;
}) {
  const Icon = card.icon;
  return (
    <div
      className={`rounded-xl border transition-colors ${
        checked
          ? 'border-accent bg-accent-soft'
          : 'border-line bg-surface'
      }`}
    >
      <label className="flex cursor-pointer items-start gap-3 p-3.5">
        <input
          type="checkbox"
          className="sr-only"
          checked={checked}
          onChange={onToggle}
        />
        <span
          aria-hidden="true"
          className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border transition-colors ${
            checked ? 'border-accent bg-accent text-white' : 'border-line bg-surface'
          }`}
        >
          {checked ? <Check className="size-3.5" strokeWidth={3} /> : null}
        </span>

        <span
          aria-hidden="true"
          className={`grid size-9 shrink-0 place-items-center rounded-lg ${
            checked ? 'bg-accent text-white' : 'bg-surface-muted text-muted'
          }`}
        >
          <Icon className="size-4.5" />
        </span>

        <span className="grid min-w-0 gap-0.5">
          <span className={`font-bold ${checked ? 'text-accent' : 'text-ink'}`}>
            {card.title}
          </span>
          <span className="text-sm leading-relaxed text-muted">{card.summary}</span>
        </span>
      </label>

      <div className="px-3.5 pb-3">
        <button
          type="button"
          onClick={onExpand}
          aria-expanded={expanded}
          className="inline-flex items-center gap-1 text-sm font-bold text-accent hover:text-accent-dark"
        >
          {expanded ? 'Show less' : 'What this means'}
          <ChevronDown
            aria-hidden="true"
            className={`size-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`}
          />
        </button>
        {expanded ? (
          <p className="mt-2 border-l-2 border-accent/30 pl-3 text-sm leading-relaxed text-muted">
            {card.learnMore}
          </p>
        ) : null}
      </div>
    </div>
  );
}

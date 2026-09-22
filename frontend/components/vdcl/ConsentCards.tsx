'use client';

import { useState } from 'react';
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
 */
const CARDS: ConsentCard[] = [
  {
    purpose: 'ASR_TRAINING',
    title: 'Speech recognition',
    summary: 'Train systems that turn speech into text in your dialect.',
    learnMore:
      'Your recordings and their transcripts are used to teach models to understand your dialect. This is the main reason Dialect Library collects voice data, and it is what most subscribing organisations are after.',
  },
  {
    purpose: 'TTS_TRAINING',
    title: 'Speech synthesis',
    summary: 'Train systems that read text aloud in your dialect.',
    learnMore:
      'A synthesis model learns general patterns of how your dialect sounds. It is not trained to reproduce your specific voice — that would be voice cloning, which Dialect Library does not offer and this licence never permits.',
  },
  {
    purpose: 'LLM_TRAINING',
    title: 'Language model training',
    summary: 'Use the text of your transcripts to train language models.',
    learnMore:
      'This covers the written transcripts rather than the audio. Text in under-represented dialects is scarce, and this is how those dialects reach the models people use every day.',
  },
  {
    purpose: 'LINGUISTIC_RESEARCH',
    title: 'Academic research',
    summary: 'Allow universities and researchers to study your dialect.',
    learnMore:
      'Non-commercial research into how your dialect is spoken, how it varies by region, and how it is changing. Researchers get the same anonymised access as anyone else — they never learn who recorded what.',
  },
  {
    purpose: 'DATASET_REDISTRIBUTION',
    title: 'Onward licensing',
    summary:
      'Allow an organisation that licenses your recordings to license them on to others.',
    learnMore:
      'Without this, a subscriber may only use your recordings themselves. With it, they may include them in datasets they license onward — which reaches further, but means Dialect Library has less direct sight of where your recordings end up. You can decline this and still allow everything else.',
    sensitive: true,
  },
  {
    purpose: 'PUBLIC_PROMOTION',
    title: 'Demos and marketing',
    summary: 'Allow short clips of your recordings to be played publicly.',
    learnMore:
      'Clips may appear in demonstrations, conference talks or marketing material showing what the dataset sounds like. Your name is never attached, but your voice would be audible to the public rather than only used inside a training pipeline.',
    sensitive: true,
  },
  {
    purpose: 'BIOMETRIC_PROCESSING',
    title: 'Speaker identification',
    summary: 'Allow processing that can tell one speaker apart from another.',
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

  return (
    <div className="grid gap-3">
      {CARDS.map((card) => {
        const isSelected = selected.includes(card.purpose);
        return (
          <div
            key={card.purpose}
            className={`rounded-lg border px-3 py-3 ${
              card.sensitive ? 'border-amber-300 bg-amber-50/40' : 'border-line'
            }`}
          >
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                className="mt-1 size-4"
                checked={isSelected}
                onChange={() => toggle(card.purpose)}
              />
              <span className="grid gap-1">
                <span className="text-sm font-bold text-ink">
                  {card.title}
                  {card.sensitive ? (
                    <span className="ml-2 rounded bg-amber-200 px-1.5 py-0.5 text-xs font-bold text-amber-900">
                      Read this one carefully
                    </span>
                  ) : null}
                </span>
                <span className="text-sm text-muted">{card.summary}</span>
              </span>
            </label>
            <button
              type="button"
              className="mt-2 text-xs font-bold text-ink underline"
              onClick={() => setExpanded(expanded === card.purpose ? null : card.purpose)}
            >
              {expanded === card.purpose ? 'Show less' : 'Learn more'}
            </button>
            {expanded === card.purpose ? (
              <p className="mt-2 text-sm leading-relaxed text-muted">{card.learnMore}</p>
            ) : null}
          </div>
        );
      })}
      <p className="text-xs text-muted">
        Voice cloning — making a synthetic copy of your specific voice — is not offered and cannot
        be granted through this licence.
      </p>
    </div>
  );
}

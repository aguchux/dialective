import { Prisma, StreamRecordKind, SubmissionStatus } from '@dialectiva/db';

/**
 * Why a recording did not make it into a manifest.
 *
 * The acceptance criterion for this phase is that an admin can explain every
 * included AND excluded recording. That is only possible if exclusion is a
 * named reason attached to the clip, not the absence of a row -- "it isn't
 * in the manifest" explains nothing to a contributor asking why their work
 * was left out.
 *
 * These are ordered by precedence in `classify`: the FIRST matching reason
 * wins, so a purged clip that is also unscored reports `audio_purged`. That
 * ordering is deliberate -- it reports the reason that is hardest to fix,
 * because telling a contributor "it needs validation" when the audio is
 * gone forever would send them after something unachievable.
 */
export type ExclusionReason =
  | 'audio_purged' // Spaces object deleted by audio-retention-job; nothing to license
  | 'rejected_by_quality_gate' // hard prefilter reject -- duration/silence/unreadable
  | 'expired_unscored' // settlement timed it out without a score
  | 'not_yet_scored' // still PENDING; resolves on its own, unlike the others
  | 'misplaced_dialect' // flagged by validators as the wrong dialect
  | 'no_audio_flagged' // validators reported no audible content
  | 'wrong_contributor'; // not owned by this contributor

export interface EligibilityOutcome {
  eligible: boolean;
  reason?: ExclusionReason;
}

/**
 * The columns `classify` reads. Kept as an explicit narrow type rather than
 * the full WordRecording so the compiler selects only these, and so adding a
 * column to WordRecording cannot silently change what compilation considers.
 */
export const ELIGIBILITY_SELECT = {
  id: true,
  userId: true,
  dialectTag: true,
  status: true,
  score: true,
  compositeScore: true,
  durationMs: true,
  transcript: true,
  audioKey: true,
  audioDeletedAt: true,
  misplacedDialectAt: true,
  noAudioClawedBackAt: true,
} satisfies Prisma.WordRecordingSelect;

/**
 * The same, for domain conversations. A separate constant rather than a subset
 * of the above because the columns genuinely differ -- this table has no
 * `score`, `transcript`, `misplacedDialectAt` or `noAudioClawedBackAt` -- and a
 * shared select would have to be the intersection, dropping signal the word
 * path needs.
 */
export const DOMAIN_ELIGIBILITY_SELECT = {
  id: true,
  userId: true,
  dialectTag: true,
  status: true,
  compositeScore: true,
  durationMs: true,
  audioKey: true,
  audioDeletedAt: true,
} satisfies Prisma.DomainConversationRecordingSelect;

/**
 * Lift a WordRecording row into a candidate.
 *
 * These two mappers are the only place the shape difference is written down.
 * A caller that builds a candidate literal by hand would have to decide what
 * to put in `score` for a domain conversation, and the tempting wrong answer
 * (`compositeScore`) would make an unscored clip look scored.
 */
export function wordCandidate(
  row: Prisma.WordRecordingGetPayload<{ select: typeof ELIGIBILITY_SELECT }>,
): EligibilityCandidate {
  return { recordKind: StreamRecordKind.WORD_RECORDING, ...row };
}

export function domainCandidate(
  row: Prisma.DomainConversationRecordingGetPayload<{ select: typeof DOMAIN_ELIGIBILITY_SELECT }>,
): EligibilityCandidate {
  return {
    recordKind: StreamRecordKind.DOMAIN_CONVERSATION_RECORDING,
    ...row,
    // Columns this table does not have. Null, never derived from another
    // column -- see the note on EligibilityCandidate.
    score: null,
    transcript: null,
    misplacedDialectAt: null,
    noAudioClawedBackAt: null,
  };
}

export type EligibilityCandidate = {
  /**
   * Which dataset this candidate came from. Carried so an exclusion can be
   * reported against the right record and so the manifest item records it --
   * `classify` itself branches on it only where the two kinds genuinely
   * differ (see below).
   */
  recordKind: StreamRecordKind;
  id: string;
  userId: string | null;
  dialectTag: string;
  status: SubmissionStatus;
  compositeScore: Prisma.Decimal | null;
  durationMs: number | null;
  audioKey: string | null;
  audioDeletedAt: Date | null;
  /**
   * The next four exist on WordRecording only. DomainConversationRecording has
   * no `score`, no `transcript`, and neither validator flag -- so they are
   * `null` for that kind, never absent-and-therefore-ignored.
   *
   * That distinction is what keeps `classify` conservative across both kinds:
   * `misplacedDialectAt` and `noAudioClawedBackAt` can only ever EXCLUDE, so a
   * kind that cannot carry them is not being let through a check it should
   * have faced -- the check does not exist for it. `score` is different and is
   * handled explicitly below.
   */
  score: Prisma.Decimal | null;
  transcript: string | null;
  misplacedDialectAt: Date | null;
  noAudioClawedBackAt: Date | null;
};

/**
 * Decide whether one recording belongs in a contributor's licence manifest.
 *
 * Two properties matter more than the specific rules:
 *
 * 1. It is PURE. No database, no settings lookup, no clock. Compilation must
 *    be reproducible -- recompiling the same recordings must yield the same
 *    manifest hash -- and a function that reads mutable state cannot promise
 *    that.
 *
 * 2. It is CONSERVATIVE. Anything uncertain is excluded. A clip wrongly left
 *    out costs the contributor a recompile; a clip wrongly INCLUDED means
 *    Dialect Library has licensed work it had no right to license, and told
 *    a subscriber so in a signed document. Those costs are not symmetric.
 */
export function classify(
  recording: EligibilityCandidate,
  agreement: { contributorId: string },
): EligibilityOutcome {
  if (recording.userId !== agreement.contributorId) {
    return { eligible: false, reason: 'wrong_contributor' };
  }
  // No dialect check. An agreement covers every dialect its contributor
  // records in, so there is nothing for a recording's dialect to mismatch
  // against -- the manifest records which dialects a version actually
  // covered. `misplaced_dialect` below is unrelated: that is a recording
  // flagged as not being the dialect it claims to be, which is a defect in
  // the recording rather than a question of scope.

  // Audio first: without it there is nothing to license, regardless of how
  // good the scores are. The transcript and score survive the purge, which
  // is exactly why this has to be checked rather than inferred from them.
  if (recording.audioDeletedAt || !recording.audioKey) {
    return { eligible: false, reason: 'audio_purged' };
  }

  if (recording.misplacedDialectAt) {
    return { eligible: false, reason: 'misplaced_dialect' };
  }
  if (recording.noAudioClawedBackAt) {
    return { eligible: false, reason: 'no_audio_flagged' };
  }

  switch (recording.status) {
    case SubmissionStatus.REJECTED:
      return { eligible: false, reason: 'rejected_by_quality_gate' };
    case SubmissionStatus.EXPIRED:
      return { eligible: false, reason: 'expired_unscored' };
    case SubmissionStatus.PENDING:
      return { eligible: false, reason: 'not_yet_scored' };
    case SubmissionStatus.SCORED:
    case SubmissionStatus.SETTLED:
      break;
    default:
      // A status this function has never seen is not silently admitted.
      // Adding a SubmissionStatus value must be a deliberate decision about
      // whether it is licensable, not something compilation guesses at.
      return { eligible: false, reason: 'not_yet_scored' };
  }

  // A SCORED/SETTLED row should always carry a score, but the columns are
  // nullable and this is a rights decision, so it is checked rather than
  // assumed.
  //
  // The two kinds differ here and the difference is load-bearing. A word
  // recording can be scored two ways (`score` from consensus/exact-match,
  // `compositeScore` from audio quality) and either is enough. A domain
  // conversation has no `score` column at all, so requiring one would exclude
  // every domain conversation forever -- and accepting its absence for a word
  // recording would admit clips that were never actually scored.
  //
  // Hence: compositeScore is required for both, and `score` is an additional
  // way for a WORD_RECORDING to qualify. Written as an explicit switch so
  // adding a kind forces a decision about what "scored" means for it rather
  // than inheriting whichever branch happens to be first.
  switch (recording.recordKind) {
    case StreamRecordKind.WORD_RECORDING:
      if (recording.score === null && recording.compositeScore === null) {
        return { eligible: false, reason: 'not_yet_scored' };
      }
      break;
    case StreamRecordKind.DOMAIN_CONVERSATION_RECORDING:
      if (recording.compositeScore === null) {
        return { eligible: false, reason: 'not_yet_scored' };
      }
      break;
  }

  return { eligible: true };
}

/**
 * A reason a contributor can act on, versus one they cannot.
 *
 * `not_yet_scored` resolves by waiting. `audio_purged` never resolves. The
 * contributor-facing summary needs to separate these, because presenting
 * them as one list of failures invites people to chase clips that are gone.
 */
export function isTransient(reason: ExclusionReason): boolean {
  return reason === 'not_yet_scored';
}

export const EXCLUSION_REASON_LABELS: Record<ExclusionReason, string> = {
  audio_purged: 'Audio was deleted under the retention policy before this licence was compiled',
  rejected_by_quality_gate: 'Rejected at submission for duration, silence or unreadable audio',
  expired_unscored: 'Timed out before it could be scored',
  not_yet_scored: 'Still awaiting scoring -- will be picked up by a later compilation',
  misplaced_dialect: 'Validators flagged this as a different dialect',
  no_audio_flagged: 'Validators reported no audible content',
  wrong_contributor: 'Not owned by this contributor',
};

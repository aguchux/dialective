/**
 * Pure decision-banding logic for DLKYC self-hosted verification -- kept
 * free of Prisma/NestJS/network so it's directly unit-testable, mirroring
 * how packages/db/src/payouts.ts isolates its scoring math from its
 * callers. Thresholds are fixed and documented as PROVISIONAL: no
 * calibration dataset exists yet (see DLKYC_PLAN.md section 18.3's release
 * gate). Revisit once real approve/decline/review outcomes can be measured.
 */

export type KycDecisionBand = 'APPROVE' | 'REVIEW' | 'DECLINE';

export interface BotFindings {
  /** 0-100 plausibility the bot assigned the document/selfie pair; null when the bot layer was skipped (disabled or errored). */
  plausibilityScore: number | null;
  flags: string[];
  summary: string | null;
}

export interface KycEvaluationInput {
  /** Cosine-similarity-derived match score, 0-100, between the document portrait and the best selfie frame. */
  faceMatchScore: number;
  /** 0-100 liveness signal from cross-frame landmark motion + challenge compliance. */
  livenessScore: number;
  botFindings: BotFindings | null;
  autoApproveEnabled: boolean;
}

export interface KycEvaluationResult {
  band: KycDecisionBand;
  faceMatchScore: number;
  livenessScore: number;
  declineReason: string | null;
}

// Provisional thresholds -- deliberately conservative (biased toward REVIEW,
// never toward auto-APPROVE) until a real evaluation dataset exists.
const FACE_MATCH_DECLINE_BELOW = 40;
const FACE_MATCH_APPROVE_AT_OR_ABOVE = 85;
const LIVENESS_DECLINE_BELOW = 40;
const LIVENESS_APPROVE_AT_OR_ABOVE = 80;
const BOT_FLAG_FORCES_REVIEW = true;

export function evaluateSelfHostedKyc(input: KycEvaluationInput): KycEvaluationResult {
  const { faceMatchScore, livenessScore, botFindings, autoApproveEnabled } = input;

  // Clear fail: either signal is decisively bad -- decline outright,
  // regardless of autoApproveEnabled (declining is never an "approval",
  // so the auto-approve kill switch doesn't need to gate this branch).
  if (faceMatchScore < FACE_MATCH_DECLINE_BELOW) {
    return {
      band: 'DECLINE',
      faceMatchScore,
      livenessScore,
      declineReason: 'The face in the selfie did not match the document photo.',
    };
  }
  if (livenessScore < LIVENESS_DECLINE_BELOW) {
    return {
      band: 'DECLINE',
      faceMatchScore,
      livenessScore,
      declineReason: 'The liveness check did not pass.',
    };
  }

  const botRaisedFlag = BOT_FLAG_FORCES_REVIEW && !!botFindings && botFindings.flags.length > 0;

  const clearPass =
    faceMatchScore >= FACE_MATCH_APPROVE_AT_OR_ABOVE &&
    livenessScore >= LIVENESS_APPROVE_AT_OR_ABOVE &&
    !botRaisedFlag;

  if (clearPass && autoApproveEnabled) {
    return { band: 'APPROVE', faceMatchScore, livenessScore, declineReason: null };
  }

  // Everything else -- uncertain, auto-approve disabled, or the bot flagged
  // something -- goes to manual review. Per DLKYC_PLAN.md section 11.3, the
  // bot's findings are only ever an input signal here; they never set
  // APPROVE themselves.
  return { band: 'REVIEW', faceMatchScore, livenessScore, declineReason: null };
}

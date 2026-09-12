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
  /**
   * LLM-assisted OCR read of the document image -- reviewer-facing ONLY,
   * per DLKYC_PLAN.md section 8.4 ("An LLM must not... declare a document
   * genuine" / "approve or reject a user"). Never treated as ground truth
   * by evaluateSelfHostedKyc; extraction failure/absence just means these
   * fields are null, not a decline reason.
   */
  extractedFields: {
    fullName: string | null;
    dateOfBirth: string | null;
    documentNumber: string | null;
  } | null;
}

export interface KycEvaluationInput {
  /** Cosine-similarity-derived match score, 0-100, between the document portrait and the best selfie frame. */
  faceMatchScore: number;
  /** 0-100 liveness signal from cross-frame landmark motion + challenge compliance. */
  livenessScore: number;
  botFindings: BotFindings | null;
  autoApproveEnabled: boolean;
  /** Admin-configurable auto-approve floor for faceMatchScore, 0-100. Defaults to FACE_MATCH_APPROVE_AT_OR_ABOVE_DEFAULT. */
  minFaceMatchScore?: number;
  /** Admin-configurable auto-approve floor for livenessScore, 0-100. Defaults to LIVENESS_APPROVE_AT_OR_ABOVE_DEFAULT. */
  minLivenessScore?: number;
  /**
   * When true, a decisively-bad score routes to REVIEW instead of
   * auto-DECLINE, so an admin can manually check a submission that failed
   * the deterministic checks (e.g. a poor-quality photo) rather than the
   * trainer being auto-rejected outright. Defaults to false (today's
   * unconditional-auto-decline behavior).
   */
  doNotAutoDeclineEnabled?: boolean;
}

export interface KycEvaluationResult {
  band: KycDecisionBand;
  faceMatchScore: number;
  livenessScore: number;
  declineReason: string | null;
}

// Provisional thresholds -- deliberately conservative (biased toward REVIEW,
// never toward auto-APPROVE) until a real evaluation dataset exists. The
// decline floors are fixed (a submission this bad is never worth auto-
// approving regardless of admin settings); the approve floors are the
// admin-configurable ones, exposed via PlatformSettings
// selfHostedKycMinFaceMatchScore/selfHostedKycMinLivenessScore.
const FACE_MATCH_DECLINE_BELOW = 40;
export const FACE_MATCH_APPROVE_AT_OR_ABOVE_DEFAULT = 85;
const LIVENESS_DECLINE_BELOW = 40;
export const LIVENESS_APPROVE_AT_OR_ABOVE_DEFAULT = 80;
const BOT_FLAG_FORCES_REVIEW = true;

export function evaluateSelfHostedKyc(input: KycEvaluationInput): KycEvaluationResult {
  const {
    faceMatchScore,
    livenessScore,
    botFindings,
    autoApproveEnabled,
    minFaceMatchScore = FACE_MATCH_APPROVE_AT_OR_ABOVE_DEFAULT,
    minLivenessScore = LIVENESS_APPROVE_AT_OR_ABOVE_DEFAULT,
    doNotAutoDeclineEnabled = false,
  } = input;

  // Clear fail: either signal is decisively bad. Normally declines
  // outright, regardless of autoApproveEnabled (declining is never an
  // "approval", so the auto-approve kill switch doesn't gate this branch)
  // -- but when doNotAutoDeclineEnabled is on, route to REVIEW instead so
  // an admin can manually check a submission that failed the deterministic
  // checks rather than auto-rejecting the trainer outright.
  if (faceMatchScore < FACE_MATCH_DECLINE_BELOW) {
    if (doNotAutoDeclineEnabled) {
      return { band: 'REVIEW', faceMatchScore, livenessScore, declineReason: null };
    }
    return {
      band: 'DECLINE',
      faceMatchScore,
      livenessScore,
      declineReason: 'The face in the selfie did not match the document photo.',
    };
  }
  if (livenessScore < LIVENESS_DECLINE_BELOW) {
    if (doNotAutoDeclineEnabled) {
      return { band: 'REVIEW', faceMatchScore, livenessScore, declineReason: null };
    }
    return {
      band: 'DECLINE',
      faceMatchScore,
      livenessScore,
      declineReason: 'The liveness check did not pass.',
    };
  }

  const botRaisedFlag = BOT_FLAG_FORCES_REVIEW && !!botFindings && botFindings.flags.length > 0;

  const clearPass =
    faceMatchScore >= minFaceMatchScore && livenessScore >= minLivenessScore && !botRaisedFlag;

  if (clearPass && autoApproveEnabled) {
    return { band: 'APPROVE', faceMatchScore, livenessScore, declineReason: null };
  }

  // Everything else -- uncertain, auto-approve disabled, or the bot flagged
  // something -- goes to manual review. Per DLKYC_PLAN.md section 11.3, the
  // bot's findings are only ever an input signal here; they never set
  // APPROVE themselves.
  return { band: 'REVIEW', faceMatchScore, livenessScore, declineReason: null };
}

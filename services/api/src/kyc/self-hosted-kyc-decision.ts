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
  /** True when a face was detected in the submitted document photo ("ID found"). Admin-gated via selfHostedKycRequireDocumentFaceDetected -- see requireDocumentFaceDetected below. */
  documentFaceDetected: boolean;
  botFindings: BotFindings | null;
  autoApproveEnabled: boolean;
  /** Admin-configurable auto-approve floor for faceMatchScore, 0-100 (PlatformSettings.selfHostedKycMinFaceMatchScore). */
  minFaceMatchScore: number;
  /** Admin-configurable auto-approve floor for livenessScore, 0-100 (PlatformSettings.selfHostedKycMinLivenessScore). */
  minLivenessScore: number;
  /** Admin-configurable decline ceiling for faceMatchScore, 0-100 (PlatformSettings.selfHostedKycMaxFaceMatchScoreForDecline). Strictly below this, the submission fails outright regardless of minFaceMatchScore. */
  maxFaceMatchScoreForDecline: number;
  /** Admin-configurable decline ceiling for livenessScore, 0-100 (PlatformSettings.selfHostedKycMaxLivenessScoreForDecline). Strictly below this, the submission fails outright regardless of minLivenessScore. */
  maxLivenessScoreForDecline: number;
  /** Admin-configurable "ID found" gate (PlatformSettings.selfHostedKycRequireDocumentFaceDetected). When true, documentFaceDetected=false is treated as a decisive fail; when false, it's ignored here (the caller already folds a missing document face into faceMatchScore=0). */
  requireDocumentFaceDetected: boolean;
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

// No score thresholds are hardcoded here -- every floor/ceiling below is a
// required KycEvaluationInput field sourced from PlatformSettings, set by
// an admin (see schema.prisma's selfHostedKyc* doc comments). Only the
// bot-flag-forces-review policy stays fixed: per DLKYC_PLAN.md section
// 11.3, the bot's findings are only ever an input signal, never a lever an
// admin can use to let a flagged submission auto-approve.
const BOT_FLAG_FORCES_REVIEW = true;

export function evaluateSelfHostedKyc(input: KycEvaluationInput): KycEvaluationResult {
  const {
    faceMatchScore,
    livenessScore,
    documentFaceDetected,
    botFindings,
    autoApproveEnabled,
    minFaceMatchScore,
    minLivenessScore,
    maxFaceMatchScoreForDecline,
    maxLivenessScoreForDecline,
    requireDocumentFaceDetected,
    doNotAutoDeclineEnabled = false,
  } = input;

  if (
    ![
      faceMatchScore,
      livenessScore,
      minFaceMatchScore,
      minLivenessScore,
      maxFaceMatchScoreForDecline,
      maxLivenessScoreForDecline,
    ].every((value) => Number.isFinite(value) && value >= 0 && value <= 100)
  ) {
    return { band: 'REVIEW', faceMatchScore, livenessScore, declineReason: null };
  }

  // Clear fail: either signal is decisively bad, or ("ID found" gate) the
  // document photo had no detectable face at all when the admin requires
  // one. Normally declines outright, regardless of autoApproveEnabled
  // (declining is never an "approval", so the auto-approve kill switch
  // doesn't gate this branch) -- but when doNotAutoDeclineEnabled is on,
  // route to REVIEW instead so an admin can manually check a submission
  // that failed the deterministic checks rather than auto-rejecting the
  // trainer outright.
  if (requireDocumentFaceDetected && !documentFaceDetected) {
    if (doNotAutoDeclineEnabled) {
      return { band: 'REVIEW', faceMatchScore, livenessScore, declineReason: null };
    }
    return {
      band: 'DECLINE',
      faceMatchScore,
      livenessScore,
      declineReason: 'No face could be detected on the submitted document photo.',
    };
  }
  if (faceMatchScore < maxFaceMatchScoreForDecline) {
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
  if (livenessScore < maxLivenessScoreForDecline) {
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

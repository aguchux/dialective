import { BotFindings, evaluateSelfHostedKyc } from './self-hosted-kyc-decision';

/** Only complete, unmodified DLKYC evaluation evidence can be reconsidered. */
export function recheckEligibility(
  face: number | null,
  live: number | null,
  raw: unknown,
  thresholds: {
    minFaceMatchScore: number;
    minLivenessScore: number;
    maxFaceMatchScoreForDecline: number;
    maxLivenessScoreForDecline: number;
    requireDocumentFaceDetected: boolean;
  },
): string | null {
  if (face === null || live === null) return 'Missing scores';
  if (!raw || typeof raw !== 'object') return 'Missing evaluation evidence';
  const evidence = raw as Record<string, unknown>;
  if (evidence.provider !== 'self' || evidence.band !== 'REVIEW' || evidence.adminOverride) {
    return 'Not an automatic review';
  }
  if (evidence.poseCompliant === false) return 'Challenge failed';
  const findings = evidence.botFindings;
  if (
    findings !== null &&
    (!findings || typeof findings !== 'object' || !Array.isArray((findings as BotFindings).flags))
  )
    return 'Incomplete bot findings';
  // documentFaceDetected wasn't recorded on evaluations from before this
  // field existed -- treat that as "detected" (true) rather than silently
  // reopening old REVIEW rows for a check they were never scored against;
  // a face-match score having been computed at all implies a document face
  // was found (see self-hosted-kyc.service.ts's runDeterministicChecks).
  const documentFaceDetected =
    typeof evidence.documentFaceDetected === 'boolean' ? evidence.documentFaceDetected : true;
  const result = evaluateSelfHostedKyc({
    faceMatchScore: face,
    livenessScore: live,
    documentFaceDetected,
    botFindings: findings as BotFindings | null,
    autoApproveEnabled: true,
    ...thresholds,
  });
  return result.band === 'APPROVE' ? null : 'Scores below floors or blocking flags';
}

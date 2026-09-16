import { recheckEligibility } from './kyc-recheck-policy';
const thresholds = {
  minFaceMatchScore: 85,
  minLivenessScore: 80,
  maxFaceMatchScoreForDecline: 40,
  maxLivenessScoreForDecline: 40,
  requireDocumentFaceDetected: true,
};
const evidence = { provider: 'self', band: 'REVIEW', botFindings: null, poseCompliant: true };
describe('DLKYC recheck eligibility', () => {
  it('accepts exact threshold values', () => {
    expect(recheckEligibility(85, 80, evidence, thresholds)).toBeNull();
  });
  it.each([
    [84, 80],
    [85, 79],
    [null, 100],
    [NaN, 100],
    [Infinity, 100],
    [101, 100],
  ])('does not approve invalid or insufficient scores %s/%s', (face, live) => {
    expect(recheckEligibility(face, live, evidence, thresholds)).not.toBeNull();
  });
  it.each([
    null,
    {},
    { ...evidence, provider: 'didit' },
    { ...evidence, band: 'DECLINE' },
    { ...evidence, adminOverride: 'decline' },
    { ...evidence, poseCompliant: false },
    { ...evidence, botFindings: {} },
    { ...evidence, botFindings: { flags: ['suspicious'] } },
  ])('keeps unsafe evidence in review', (raw) => {
    expect(recheckEligibility(99, 99, raw, thresholds)).not.toBeNull();
  });
});

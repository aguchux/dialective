import { evaluateSelfHostedKyc } from './self-hosted-kyc-decision';

function base(overrides: Partial<Parameters<typeof evaluateSelfHostedKyc>[0]> = {}) {
  return {
    faceMatchScore: 90,
    livenessScore: 90,
    documentFaceDetected: true,
    botFindings: null,
    autoApproveEnabled: true,
    minFaceMatchScore: 85,
    minLivenessScore: 80,
    maxFaceMatchScoreForDecline: 40,
    maxLivenessScoreForDecline: 40,
    requireDocumentFaceDetected: true,
    ...overrides,
  };
}

describe('evaluateSelfHostedKyc', () => {
  it('declines outright when the face match score is below the admin decline ceiling, regardless of autoApprove', () => {
    const result = evaluateSelfHostedKyc(base({ faceMatchScore: 10, autoApproveEnabled: false }));
    expect(result.band).toBe('DECLINE');
    expect(result.declineReason).toMatch(/face/i);
  });

  it('declines outright when the liveness score is below the admin decline ceiling', () => {
    const result = evaluateSelfHostedKyc(base({ livenessScore: 10 }));
    expect(result.band).toBe('DECLINE');
    expect(result.declineReason).toMatch(/liveness/i);
  });

  it('approves only when scores are clearly high AND autoApproveEnabled is true', () => {
    const result = evaluateSelfHostedKyc(base({ faceMatchScore: 95, livenessScore: 95 }));
    expect(result.band).toBe('APPROVE');
  });

  it('routes a clear-pass case to REVIEW when autoApproveEnabled is off', () => {
    const result = evaluateSelfHostedKyc(
      base({ faceMatchScore: 95, livenessScore: 95, autoApproveEnabled: false }),
    );
    expect(result.band).toBe('REVIEW');
  });

  it('routes an otherwise-clear-pass case to REVIEW when the bot raised a flag', () => {
    const result = evaluateSelfHostedKyc(
      base({
        faceMatchScore: 95,
        livenessScore: 95,
        botFindings: {
          plausibilityScore: 40,
          flags: ['name mismatch'],
          summary: 'concern',
          extractedFields: null,
        },
      }),
    );
    expect(result.band).toBe('REVIEW');
  });

  it('routes mid-range (uncertain, not decisively bad) scores to REVIEW', () => {
    const result = evaluateSelfHostedKyc(base({ faceMatchScore: 60, livenessScore: 60 }));
    expect(result.band).toBe('REVIEW');
  });

  it('never sets APPROVE based on bot findings alone -- a clean bot pass with weak deterministic scores still lands in REVIEW', () => {
    const result = evaluateSelfHostedKyc(
      base({
        faceMatchScore: 60,
        livenessScore: 60,
        botFindings: {
          plausibilityScore: 100,
          flags: [],
          summary: 'looks fine',
          extractedFields: null,
        },
      }),
    );
    expect(result.band).toBe('REVIEW');
  });

  it('uses the admin-configured approve floors', () => {
    const belowFloor = evaluateSelfHostedKyc(base({ faceMatchScore: 84, livenessScore: 90 }));
    expect(belowFloor.band).toBe('REVIEW');
    const atFloor = evaluateSelfHostedKyc(base({ faceMatchScore: 85, livenessScore: 80 }));
    expect(atFloor.band).toBe('APPROVE');
  });

  it('honors an admin-lowered minFaceMatchScore/minLivenessScore', () => {
    const result = evaluateSelfHostedKyc(
      base({
        faceMatchScore: 60,
        livenessScore: 70,
        minFaceMatchScore: 50,
        minLivenessScore: 65,
        maxFaceMatchScoreForDecline: 30,
        maxLivenessScoreForDecline: 30,
      }),
    );
    expect(result.band).toBe('APPROVE');
  });

  it('honors an admin-raised minFaceMatchScore/minLivenessScore, routing a would-be-default-pass to REVIEW', () => {
    const result = evaluateSelfHostedKyc(
      base({ faceMatchScore: 90, livenessScore: 90, minFaceMatchScore: 95, minLivenessScore: 95 }),
    );
    expect(result.band).toBe('REVIEW');
  });

  it('honors an admin-lowered decline ceiling, letting a score that used to auto-decline reach REVIEW instead', () => {
    const result = evaluateSelfHostedKyc(
      base({
        faceMatchScore: 30,
        livenessScore: 90,
        minFaceMatchScore: 85,
        maxFaceMatchScoreForDecline: 20,
      }),
    );
    expect(result.band).toBe('REVIEW');
  });

  it('honors an admin-raised decline ceiling, declining a score that used to reach REVIEW', () => {
    const result = evaluateSelfHostedKyc(
      base({
        faceMatchScore: 60,
        livenessScore: 90,
        maxFaceMatchScoreForDecline: 65,
      }),
    );
    expect(result.band).toBe('DECLINE');
  });

  it('routes a decisively-bad face match to REVIEW instead of DECLINE when doNotAutoDeclineEnabled is on', () => {
    const result = evaluateSelfHostedKyc(
      base({ faceMatchScore: 10, doNotAutoDeclineEnabled: true }),
    );
    expect(result.band).toBe('REVIEW');
    expect(result.declineReason).toBeNull();
  });

  it('routes a decisively-bad liveness score to REVIEW instead of DECLINE when doNotAutoDeclineEnabled is on', () => {
    const result = evaluateSelfHostedKyc(
      base({ livenessScore: 10, doNotAutoDeclineEnabled: true }),
    );
    expect(result.band).toBe('REVIEW');
    expect(result.declineReason).toBeNull();
  });

  it('still declines outright when doNotAutoDeclineEnabled is omitted (defaults to false)', () => {
    const result = evaluateSelfHostedKyc(base({ faceMatchScore: 10 }));
    expect(result.band).toBe('DECLINE');
  });

  it('doNotAutoDeclineEnabled does not affect a clear pass -- auto-approval still applies normally', () => {
    const result = evaluateSelfHostedKyc(
      base({ faceMatchScore: 95, livenessScore: 95, doNotAutoDeclineEnabled: true }),
    );
    expect(result.band).toBe('APPROVE');
  });

  it('declines outright ("ID found" gate) when no document face was detected and requireDocumentFaceDetected is on', () => {
    const result = evaluateSelfHostedKyc(base({ documentFaceDetected: false }));
    expect(result.band).toBe('DECLINE');
    expect(result.declineReason).toMatch(/document/i);
  });

  it('routes the "ID found" failure to REVIEW instead of DECLINE when doNotAutoDeclineEnabled is on', () => {
    const result = evaluateSelfHostedKyc(
      base({ documentFaceDetected: false, doNotAutoDeclineEnabled: true }),
    );
    expect(result.band).toBe('REVIEW');
    expect(result.declineReason).toBeNull();
  });

  it('ignores documentFaceDetected=false when requireDocumentFaceDetected is off, falling through to the normal face-match banding', () => {
    const result = evaluateSelfHostedKyc(
      base({ documentFaceDetected: false, requireDocumentFaceDetected: false }),
    );
    expect(result.band).toBe('APPROVE');
  });
});

import { evaluateSelfHostedKyc } from './self-hosted-kyc-decision';

function base(overrides: Partial<Parameters<typeof evaluateSelfHostedKyc>[0]> = {}) {
  return {
    faceMatchScore: 90,
    livenessScore: 90,
    botFindings: null,
    autoApproveEnabled: true,
    ...overrides,
  };
}

describe('evaluateSelfHostedKyc', () => {
  it('declines outright when the face match score is decisively bad, regardless of autoApprove', () => {
    const result = evaluateSelfHostedKyc(base({ faceMatchScore: 10, autoApproveEnabled: false }));
    expect(result.band).toBe('DECLINE');
    expect(result.declineReason).toMatch(/face/i);
  });

  it('declines outright when the liveness score is decisively bad', () => {
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

  it('uses the default 85/80 approve floors when minFaceMatchScore/minLivenessScore are omitted', () => {
    const belowDefault = evaluateSelfHostedKyc(base({ faceMatchScore: 84, livenessScore: 90 }));
    expect(belowDefault.band).toBe('REVIEW');
    const atDefault = evaluateSelfHostedKyc(base({ faceMatchScore: 85, livenessScore: 80 }));
    expect(atDefault.band).toBe('APPROVE');
  });

  it('honors an admin-lowered minFaceMatchScore/minLivenessScore', () => {
    const result = evaluateSelfHostedKyc(
      base({ faceMatchScore: 60, livenessScore: 70, minFaceMatchScore: 50, minLivenessScore: 65 }),
    );
    expect(result.band).toBe('APPROVE');
  });

  it('honors an admin-raised minFaceMatchScore/minLivenessScore, routing a would-be-default-pass to REVIEW', () => {
    const result = evaluateSelfHostedKyc(
      base({ faceMatchScore: 90, livenessScore: 90, minFaceMatchScore: 95, minLivenessScore: 95 }),
    );
    expect(result.band).toBe('REVIEW');
  });

  it('still declines outright below the fixed decline floor even if an admin-lowered approve floor would otherwise pass', () => {
    const result = evaluateSelfHostedKyc(
      base({ faceMatchScore: 30, livenessScore: 90, minFaceMatchScore: 20 }),
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
});

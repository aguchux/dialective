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
});

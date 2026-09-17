process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'test-secret';

import {
  signWordValidationPresentmentToken,
  verifyWordValidationPresentmentToken,
} from './word-validation-presentment.util';

describe('word validation presentment token', () => {
  it('round-trips a valid token, exposing the server-signed issuedAt', () => {
    const token = signWordValidationPresentmentToken({ sub: 'user-1', recordingId: 'rec-1' });
    const result = verifyWordValidationPresentmentToken(token, {
      userId: 'user-1',
      recordingId: 'rec-1',
    });
    expect(result).not.toBeNull();
    expect(result!.issuedAt.getTime()).toBeLessThanOrEqual(Date.now());
    expect(result!.issuedAt.getTime()).toBeGreaterThan(Date.now() - 5000);
  });

  it('rejects a token issued for a different user', () => {
    const token = signWordValidationPresentmentToken({ sub: 'user-1', recordingId: 'rec-1' });
    const result = verifyWordValidationPresentmentToken(token, {
      userId: 'user-2',
      recordingId: 'rec-1',
    });
    expect(result).toBeNull();
  });

  it('rejects a token issued for a different recording (no replaying across items)', () => {
    const token = signWordValidationPresentmentToken({ sub: 'user-1', recordingId: 'rec-1' });
    const result = verifyWordValidationPresentmentToken(token, {
      userId: 'user-1',
      recordingId: 'rec-2',
    });
    expect(result).toBeNull();
  });

  it('rejects garbage input instead of throwing', () => {
    const result = verifyWordValidationPresentmentToken('not-a-real-token', {
      userId: 'user-1',
      recordingId: 'rec-1',
    });
    expect(result).toBeNull();
  });
});

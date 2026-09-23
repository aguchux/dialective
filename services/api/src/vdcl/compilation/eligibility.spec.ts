import { SubmissionStatus } from '@dialectiva/db';
import { EligibilityCandidate, classify, isTransient } from './eligibility';

/**
 * Eligibility decides what a contributor's signature actually covers, so the
 * asymmetry matters more than the individual rules: a clip wrongly excluded
 * costs a recompile, a clip wrongly INCLUDED means Dialect Library licensed
 * work it had no right to and said so in a signed document.
 *
 * These tests pin the conservative direction at every branch.
 */
describe('VDCL eligibility', () => {
  const agreement = { contributorId: 'user-1' };

  function recording(overrides: Partial<EligibilityCandidate> = {}): EligibilityCandidate {
    return {
      id: 'rec-1',
      userId: 'user-1',
      dialectTag: 'ig-ng',
      status: SubmissionStatus.SCORED,
      score: { toString: () => '82.00' } as never,
      compositeScore: { toString: () => '79.50' } as never,
      durationMs: 2400,
      transcript: 'a transcript',
      audioKey: 'recordings/abc.webm',
      audioDeletedAt: null,
      misplacedDialectAt: null,
      noAudioClawedBackAt: null,
      ...overrides,
    };
  }

  it('includes a scored recording with audio from the right contributor and dialect', () => {
    expect(classify(recording(), agreement)).toEqual({ eligible: true });
  });

  it('includes a SETTLED recording -- payout state is not a licensing question', () => {
    expect(classify(recording({ status: SubmissionStatus.SETTLED }), agreement).eligible).toBe(
      true,
    );
  });

  it("never includes another contributor's recording", () => {
    // The single most consequential failure: licensing someone else's voice.
    const result = classify(recording({ userId: 'someone-else' }), agreement);
    expect(result).toEqual({ eligible: false, reason: 'wrong_contributor' });
  });

  it('includes every dialect the contributor recorded in', () => {
    // A licence is holistic: it covers whatever its contributor has
    // recorded. Someone who records Igbo and later Pidgin holds ONE licence
    // covering both, rather than having their second dialect sit unlicensed
    // behind a scope they were never told about.
    for (const dialectTag of ['ig-ng', 'yo-ng', 'pcm']) {
      expect(classify(recording({ dialectTag }), agreement).eligible).toBe(true);
    }
  });

  it('excludes a recording whose audio was purged, even though its scores survive', () => {
    // The transcript and score outlive the audio, so eligibility cannot be
    // inferred from them -- there is nothing left to license.
    const result = classify(
      recording({ audioKey: null, audioDeletedAt: new Date() }),
      agreement,
    );
    expect(result.reason).toBe('audio_purged');
  });

  it('excludes a recording with a null audioKey but no deletion stamp', () => {
    expect(classify(recording({ audioKey: null }), agreement).reason).toBe('audio_purged');
  });

  it('reports audio_purged ahead of any other fault', () => {
    // Precedence is deliberate: telling a contributor "it needs scoring"
    // when the audio is gone forever sends them after something
    // unachievable.
    const result = classify(
      recording({
        audioKey: null,
        audioDeletedAt: new Date(),
        status: SubmissionStatus.PENDING,
        misplacedDialectAt: new Date(),
      }),
      agreement,
    );
    expect(result.reason).toBe('audio_purged');
  });

  it.each([
    [SubmissionStatus.REJECTED, 'rejected_by_quality_gate'],
    [SubmissionStatus.EXPIRED, 'expired_unscored'],
    [SubmissionStatus.PENDING, 'not_yet_scored'],
  ])('excludes a %s recording as %s', (status, reason) => {
    expect(classify(recording({ status }), agreement).reason).toBe(reason);
  });

  it('excludes a recording validators flagged as the wrong dialect', () => {
    expect(classify(recording({ misplacedDialectAt: new Date() }), agreement).reason).toBe(
      'misplaced_dialect',
    );
  });

  it('excludes a recording validators reported as having no audio', () => {
    expect(classify(recording({ noAudioClawedBackAt: new Date() }), agreement).reason).toBe(
      'no_audio_flagged',
    );
  });

  it('excludes a SCORED row carrying no score at all', () => {
    // The status says scored but the columns are null. This is checked
    // rather than assumed, because it is a rights decision.
    const result = classify(recording({ score: null, compositeScore: null }), agreement);
    expect(result).toEqual({ eligible: false, reason: 'not_yet_scored' });
  });

  it('accepts a row with a composite score but no raw score', () => {
    expect(classify(recording({ score: null }), agreement).eligible).toBe(true);
  });

  it('refuses to admit an unrecognised status', () => {
    // Adding a SubmissionStatus must be a deliberate decision about whether
    // it is licensable, never something compilation guesses at.
    const result = classify(
      recording({ status: 'SOME_FUTURE_STATUS' as SubmissionStatus }),
      agreement,
    );
    expect(result.eligible).toBe(false);
  });

  it('is pure -- the same input always gives the same answer', () => {
    // Compilation must be reproducible for the manifest hash to mean
    // anything, which a function reading settings or the clock could not
    // promise.
    const input = recording();
    expect(classify(input, agreement)).toEqual(classify(input, agreement));
  });

  describe('isTransient', () => {
    it('marks an unscored clip as resolvable by waiting', () => {
      expect(isTransient('not_yet_scored')).toBe(true);
    });

    it('marks a purged clip as never resolving', () => {
      // Presenting these in one list would invite contributors to chase
      // clips that are gone.
      expect(isTransient('audio_purged')).toBe(false);
      expect(isTransient('rejected_by_quality_gate')).toBe(false);
    });
  });
});

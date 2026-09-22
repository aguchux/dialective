import { CanonicalManifest, canonicalDecimal, canonicalise, hashManifest } from './manifest-hash';

/**
 * This hash is what a PDF, a QR code and a subscriber's provenance check all
 * assert. It has to mean the same thing years after issuance, computed on a
 * different machine, from a database that has since gained columns.
 *
 * These tests pin the properties that makes true: order-independence,
 * field-independence, and precision stability across a database round trip.
 */
describe('VDCL manifest hash', () => {
  function manifest(overrides: Partial<CanonicalManifest> = {}): CanonicalManifest {
    return {
      manifestKey: 'VDM-NG-IGNG-A1B2C3D4-1',
      licenceKey: 'VDCL-NG-IGNG-A1B2C3D4',
      version: 1,
      contributorId: 'user-1',
      dialectTag: 'ig-ng',
      countryId: 'country-1',
      recordingCount: 2,
      totalDurationMs: '4800',
      transcriptCount: 1,
      excludedCount: 3,
      meanCompositeScore: '79.50',
      asrPipelineVersion: 'whisper',
      qualityPipelineVersion: null,
      purposes: ['ASR_TRAINING', 'LLM_TRAINING'],
      items: [
        {
          recordingId: 'rec-b',
          durationMs: 2400,
          dialectTag: 'ig-ng',
          compositeScore: '79.50',
          score: '82.00',
          hasTranscript: true,
        },
        {
          recordingId: 'rec-a',
          durationMs: 2400,
          dialectTag: 'ig-ng',
          compositeScore: '79.50',
          score: null,
          hasTranscript: false,
        },
      ],
      ...overrides,
    };
  }

  it('is stable across item ordering', () => {
    // Query order must never change the hash -- a recompile that returned
    // rows in a different order would otherwise invalidate a signed
    // document.
    const forward = manifest();
    const reversed = manifest({ items: [...manifest().items].reverse() });
    expect(hashManifest(forward)).toBe(hashManifest(reversed));
  });

  it('is stable across object key ordering', () => {
    const a = manifest();
    const b: CanonicalManifest = JSON.parse(
      JSON.stringify({
        items: a.items,
        version: a.version,
        licenceKey: a.licenceKey,
        manifestKey: a.manifestKey,
        contributorId: a.contributorId,
        dialectTag: a.dialectTag,
        countryId: a.countryId,
        recordingCount: a.recordingCount,
        totalDurationMs: a.totalDurationMs,
        transcriptCount: a.transcriptCount,
        excludedCount: a.excludedCount,
        meanCompositeScore: a.meanCompositeScore,
        asrPipelineVersion: a.asrPipelineVersion,
        qualityPipelineVersion: a.qualityPipelineVersion,
        purposes: a.purposes,
      }),
    );
    expect(hashManifest(b)).toBe(hashManifest(a));
  });

  it('is stable across purpose ordering', () => {
    const a = manifest({ purposes: ['ASR_TRAINING', 'LLM_TRAINING'] });
    const b = manifest({ purposes: ['LLM_TRAINING', 'ASR_TRAINING'] });
    expect(hashManifest(a)).toBe(hashManifest(b));
  });

  it('changes when a covered recording changes', () => {
    const changed = manifest();
    changed.items[0].recordingId = 'rec-c';
    expect(hashManifest(changed)).not.toBe(hashManifest(manifest()));
  });

  it('changes when the granted purposes change', () => {
    // The purposes are part of what was signed, so a licence granting more
    // uses must not hash the same as one granting fewer.
    expect(hashManifest(manifest({ purposes: ['ASR_TRAINING'] }))).not.toBe(
      hashManifest(manifest()),
    );
  });

  it('changes when a score changes', () => {
    const changed = manifest();
    changed.items[0].compositeScore = '80.00';
    expect(hashManifest(changed)).not.toBe(hashManifest(manifest()));
  });

  it('ignores fields outside the canonical set', () => {
    // Adding a column to VdclManifest must not invalidate hashes already
    // printed on documents in the world.
    const withExtra = { ...manifest(), someNewColumn: 'added later' } as CanonicalManifest;
    expect(hashManifest(withExtra)).toBe(hashManifest(manifest()));
  });

  it('embeds the canonical version, so the rules can change without breaking old hashes', () => {
    expect(canonicalise(manifest())).toContain('"canonicalVersion":1');
  });

  it('distinguishes a null score from a zero score', () => {
    const nulled = manifest();
    nulled.items[0].score = null;
    const zeroed = manifest();
    zeroed.items[0].score = '0.00';
    expect(hashManifest(nulled)).not.toBe(hashManifest(zeroed));
  });

  it('refuses to canonicalise a non-finite number rather than hashing garbage', () => {
    expect(() => hashManifest(manifest({ version: NaN }))).toThrow();
  });

  describe('canonicalDecimal', () => {
    it('normalises to the column scale so a round trip does not change the hash', () => {
      // Decimal(5,2) read back through a different driver may stringify
      // differently; going through the declared scale makes both agree.
      expect(canonicalDecimal({ toString: () => '79.5' })).toBe('79.50');
      expect(canonicalDecimal({ toString: () => '79.500' })).toBe('79.50');
      expect(canonicalDecimal({ toString: () => '79.50' })).toBe('79.50');
    });

    it('keeps null as null rather than coercing it to zero', () => {
      expect(canonicalDecimal(null)).toBeNull();
      expect(canonicalDecimal(undefined)).toBeNull();
    });
  });
});

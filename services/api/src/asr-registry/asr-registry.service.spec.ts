import { AsrRegistryService } from './asr-registry.service';

/**
 * The registry is a routing table with real consequences: a dialect_tag
 * missing from it means api publishes the recording with no asr_stream, no
 * worker ever consumes it, and the recording ends up permanently without a
 * transcript -- silently, because a miss is not an error. That is exactly
 * how 17 dialects and 82k+ recordings went untranscribed for a month
 * before anyone noticed, so these tests pin the real file's contents
 * rather than a fixture.
 */
describe('AsrRegistryService', () => {
  const service = new AsrRegistryService();

  describe('resolve', () => {
    it('routes every mapped dialect to a real engine and stream', () => {
      for (const tag of service.mappedDialectTags()) {
        const entry = service.resolve(tag);
        expect(entry).toBeDefined();
        expect(['vosk', 'whisper']).toContain(entry!.engine);
        // The worker consumes asr-jobs-<engine>; a stream that disagrees
        // with the engine routes the job to a worker that will reject it.
        expect(entry!.stream).toBe(`asr-jobs-${entry!.engine}`);
      }
    });

    it('gives every whisper dialect a checkpoint to load', () => {
      // vosk resolves its model from its own image; whisper pulls the
      // checkpoint named here from HuggingFace, so a whisper entry without
      // one raises UnsupportedDialectError in the worker at claim time.
      for (const tag of service.mappedDialectTags()) {
        const entry = service.resolve(tag)!;
        if (entry.engine === 'whisper') {
          expect(typeof entry.checkpoint).toBe('string');
          expect(entry.checkpoint!.length).toBeGreaterThan(0);
        }
      }
    });

    it('covers the dialects carrying real production volume', () => {
      // Each of these had thousands of recordings and no entry. Listing
      // them explicitly means removing one fails here rather than quietly
      // turning transcription off for that language again.
      for (const tag of ['yo', 'ha', 'ig', 'pcm', 'zu', 'xh', 'am', 'st-za', 'ak', 'sw-ke', 'arz', 'tn', 'ary']) {
        expect(service.resolve(tag)).toBeDefined();
      }
    });

    it('returns undefined for an unmapped dialect', () => {
      expect(service.resolve('definitely-not-a-dialect')).toBeUndefined();
    });

    it('warns once per unmapped dialect, not once per recording', () => {
      const fresh = new AsrRegistryService();
      const warn = jest
        .spyOn((fresh as unknown as { logger: { warn: (m: string) => void } }).logger, 'warn')
        .mockImplementation(() => undefined);

      fresh.resolve('unmapped-tag');
      fresh.resolve('unmapped-tag');
      fresh.resolve('unmapped-tag');

      // A dialect with thousands of submissions must not drown the log.
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).toContain('unmapped-tag');
    });

    it('does not warn for a mapped dialect', () => {
      const fresh = new AsrRegistryService();
      const warn = jest
        .spyOn((fresh as unknown as { logger: { warn: (m: string) => void } }).logger, 'warn')
        .mockImplementation(() => undefined);

      fresh.resolve('yo');

      expect(warn).not.toHaveBeenCalled();
    });
  });
});

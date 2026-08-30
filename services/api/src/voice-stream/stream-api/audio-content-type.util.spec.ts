import { contentTypeForAudioKey } from './audio-content-type.util';

describe('contentTypeForAudioKey', () => {
  it.each([
    ['ig/forward/abc/xyz.wav', 'audio/wav'],
    ['ig/forward/abc/xyz.webm', 'audio/webm'],
    ['ig/forward/abc/xyz.ogg', 'audio/ogg'],
    ['ig/forward/abc/xyz.WAV', 'audio/wav'],
  ])('%s -> %s', (key, expected) => {
    expect(contentTypeForAudioKey(key)).toBe(expected);
  });

  it('falls back to application/octet-stream for an unknown extension', () => {
    expect(contentTypeForAudioKey('some/path/file.xyz')).toBe('application/octet-stream');
  });

  it('falls back to application/octet-stream for no extension', () => {
    expect(contentTypeForAudioKey('some/path/file')).toBe('application/octet-stream');
  });
});

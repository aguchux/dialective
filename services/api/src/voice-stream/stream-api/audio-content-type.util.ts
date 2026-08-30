/**
 * Inverse of words.service.ts's EXTENSION_BY_CONTENT_TYPE -- WordRecording
 * has no stored mime-type column, so the audio streaming route infers
 * Content-Type from the audioKey's extension (the same fixed set of
 * container formats the trainer upload pipeline ever produces).
 */
const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  wav: 'audio/wav',
  webm: 'audio/webm',
  ogg: 'audio/ogg',
};

export function contentTypeForAudioKey(audioKey: string): string {
  const extension = audioKey.split('.').pop()?.toLowerCase();
  return (extension && CONTENT_TYPE_BY_EXTENSION[extension]) || 'application/octet-stream';
}

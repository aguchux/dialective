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
  // iOS Safari's MediaRecorder fallback -- see words.service.ts/
  // domain-conversations.service.ts's EXTENSION_BY_CONTENT_TYPE comment for
  // why an m4a container can show up in this fixed set now.
  m4a: 'audio/mp4',
};

export function contentTypeForAudioKey(audioKey: string): string {
  const extension = audioKey.split('.').pop()?.toLowerCase();
  return (extension && CONTENT_TYPE_BY_EXTENSION[extension]) || 'application/octet-stream';
}

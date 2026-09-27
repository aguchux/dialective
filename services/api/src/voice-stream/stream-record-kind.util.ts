import { StreamRecordKind } from '@dialectiva/db';

/**
 * The composite identity of a streamable record.
 *
 * `WordRecording` and `DomainConversationRecording` have independent uuid
 * spaces, so a bare id is not a key. Anywhere records of both kinds share one
 * collection -- a Set of "already covered" ids, a Map of resolved records, a
 * snapshot compared for equality -- the key has to carry the kind, or one
 * kind's record can shadow the other's.
 *
 * A collision is vanishingly unlikely with v4 uuids. This exists because the
 * consequences are not proportional to the likelihood: in a coverage check it
 * would mean an unlicensed recording vouched for by a licensed one.
 */
export function kindKey(kind: StreamRecordKind, id: string): string {
  return `${kind}:${id}`;
}

/**
 * Reads a record kind off an untrusted payload, defaulting to WORD_RECORDING.
 *
 * For Redis stream messages and API bodies written before multi-dataset
 * support existed: word recordings were the only thing that could be streamed,
 * so the default is the historically correct reading of an absent field rather
 * than a guess. An unrecognised value also falls back rather than throwing --
 * a queue consumer that rejects a message it half-understands stalls the
 * stream, and the conservative kind is the one that existed.
 */
export function readRecordKind(value: unknown): StreamRecordKind {
  return value === StreamRecordKind.DOMAIN_CONVERSATION_RECORDING
    ? StreamRecordKind.DOMAIN_CONVERSATION_RECORDING
    : StreamRecordKind.WORD_RECORDING;
}

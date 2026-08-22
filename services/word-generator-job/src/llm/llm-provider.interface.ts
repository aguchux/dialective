export type LlmProviderKey = 'openai' | 'deepseek' | 'anthropic';

export const ALL_PROVIDER_KEYS: LlmProviderKey[] = ['openai', 'deepseek', 'anthropic'];

/**
 * A single provider generates a batch of strings from a prompt that
 * instructs it to return a JSON array of strings and nothing else. Each
 * implementation is responsible for parsing/validating its own response --
 * throwing on any network error, non-2xx, malformed JSON, or shape
 * mismatch -- so LlmFallbackChain can treat "provider failed" uniformly via
 * try/catch and move to the next provider in the configured order.
 */
export interface LlmProvider {
  readonly key: LlmProviderKey;
  generate(prompt: string): Promise<string[]>;
  /** Same call as generate, but returns the raw text response unparsed -- lets callers apply a different response-shape parser (see parsePosItemArray) without duplicating provider request logic. */
  generateRaw(prompt: string): Promise<string>;
}

export const PART_OF_SPEECH_VALUES = [
  'NOUN',
  'VERB',
  'ADJECTIVE',
  'ADVERB',
  'PRONOUN',
  'PREPOSITION',
  'CONJUNCTION',
  'INTERJECTION',
  'DETERMINER',
  'OTHER',
] as const;
export type PartOfSpeechValue = (typeof PART_OF_SPEECH_VALUES)[number];

export interface PosItem {
  text: string;
  partOfSpeech: PartOfSpeechValue;
}

/** Parses and validates a provider's raw text response as a JSON array of non-empty strings. */
export function parseJsonStringArray(raw: string): string[] {
  const array = parseJsonArray(raw);
  const strings = array.map((item) => (typeof item === 'string' ? item.trim() : ''));
  if (strings.some((item) => item.length === 0)) {
    throw new Error('Response array contained a non-string or empty item');
  }
  return strings;
}

/**
 * Parses a provider's raw text response as a JSON array of {text,
 * partOfSpeech} items. Fail-soft on the tag specifically (an
 * unrecognized/missing partOfSpeech coerces to 'OTHER' rather than
 * rejecting the whole batch) since a bad classification is far less
 * costly than losing an otherwise-good generated word/translation --
 * mirrors WordGeneratorService.filterAndValidate's per-item skip
 * posture, just coercing instead of skipping since text is still usable.
 */
export function parsePosItemArray(raw: string): PosItem[] {
  const array = parseJsonArray(raw);
  const items: PosItem[] = [];
  for (const entry of array) {
    if (typeof entry !== 'object' || entry === null) continue;
    const text =
      typeof (entry as { text?: unknown }).text === 'string'
        ? (entry as { text: string }).text.trim()
        : '';
    if (!text) continue;
    const rawTag = (entry as { partOfSpeech?: unknown }).partOfSpeech;
    const tag =
      typeof rawTag === 'string' ? (rawTag.trim().toUpperCase() as PartOfSpeechValue) : 'OTHER';
    const partOfSpeech = PART_OF_SPEECH_VALUES.includes(tag) ? tag : 'OTHER';
    items.push({ text, partOfSpeech });
  }
  if (items.length === 0) {
    throw new Error('Response array contained no valid {text, partOfSpeech} items');
  }
  return items;
}

function parseJsonArray(raw: string): unknown[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Response was not valid JSON');
  }
  const array = Array.isArray(parsed) ? parsed : (parsed as { items?: unknown })?.items;
  if (!Array.isArray(array)) {
    throw new Error('Response JSON was not an array (or { items: [...] })');
  }
  return array;
}

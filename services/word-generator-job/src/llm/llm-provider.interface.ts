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
}

/** Parses and validates a provider's raw text response as a JSON array of non-empty strings. */
export function parseJsonStringArray(raw: string): string[] {
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
  const strings = array.map((item) => (typeof item === 'string' ? item.trim() : ''));
  if (strings.some((item) => item.length === 0)) {
    throw new Error('Response array contained a non-string or empty item');
  }
  return strings;
}

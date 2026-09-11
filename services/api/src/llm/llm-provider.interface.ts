export type LlmProviderKey = 'openai' | 'deepseek' | 'anthropic';

export const ALL_PROVIDER_KEYS: LlmProviderKey[] = ['openai', 'deepseek', 'anthropic'];

/**
 * A single provider normalizes one prompt into one plain-text response --
 * unlike word-generator-job's LlmProvider (batch JSON-array generation),
 * this is a single string in, single string out shape, used for spelling
 * normalization and admin-triggered keyboard-layout drafting. Each
 * implementation throws on any network error, non-2xx, or empty response
 * so LlmFallbackChain can treat "provider failed" uniformly via try/catch
 * and move to the next provider in the configured order.
 */
export interface LlmProvider {
  readonly key: LlmProviderKey;
  normalize(prompt: string): Promise<string>;
  /**
   * Optional multimodal capability -- only implemented by providers whose
   * chat model actually accepts image input (OpenAI's gpt-4o-mini,
   * Anthropic's Claude). deepseek-chat is text-only and omits this method
   * entirely; LlmFallbackChain.describeImage filters it out of any
   * describeImage() provider order rather than calling it and getting a
   * confusing runtime failure.
   */
  describeImage?(imageBase64: string, mimeType: string, prompt: string): Promise<string>;
}

const DEFAULT_PROVIDER_ORDER: LlmProviderKey[] = ['openai', 'deepseek', 'anthropic'];

/** Parses a CSV provider-order string, falling back to the default order if it isn't a valid permutation. */
export function parseProviderOrder(csv: string): LlmProviderKey[] {
  const parts = csv.split(',').map((part) => part.trim()) as LlmProviderKey[];
  const isValidPermutation =
    parts.length === ALL_PROVIDER_KEYS.length &&
    ALL_PROVIDER_KEYS.every((key) => parts.includes(key)) &&
    new Set(parts).size === ALL_PROVIDER_KEYS.length;
  return isValidPermutation ? parts : DEFAULT_PROVIDER_ORDER;
}

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
  /** Same call as generate, but returns the raw text response unparsed -- lets callers apply a different response-shape parser (see parseDomainPromptItemArray) without duplicating provider request logic. */
  generateRaw(prompt: string): Promise<string>;
}

export interface DomainPromptItem {
  domain: string;
  scenarioKey: string;
  neutralText: string;
  maleText: string;
  femaleText: string;
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
 * Parses a provider's raw text response as a JSON array of
 * {domain, scenarioKey, neutralText, maleText, femaleText} items. Skips
 * (rather than rejects the whole batch for) any entry missing a required
 * field -- a bad/incomplete generated scenario is far less costly to drop
 * than losing an otherwise-good batch, mirrors parsePosItemArray's
 * fail-soft posture in word-generator-job.
 */
export function parseDomainPromptItemArray(raw: string): DomainPromptItem[] {
  const array = parseJsonArray(raw);
  const items: DomainPromptItem[] = [];
  for (const entry of array) {
    if (typeof entry !== 'object' || entry === null) continue;
    const record = entry as Record<string, unknown>;
    const domain = typeof record.domain === 'string' ? record.domain.trim() : '';
    const scenarioKey = typeof record.scenarioKey === 'string' ? record.scenarioKey.trim() : '';
    const neutralText = typeof record.neutralText === 'string' ? record.neutralText.trim() : '';
    const maleText = typeof record.maleText === 'string' ? record.maleText.trim() : '';
    const femaleText = typeof record.femaleText === 'string' ? record.femaleText.trim() : '';
    if (!domain || !scenarioKey || !neutralText || !maleText || !femaleText) continue;
    items.push({ domain, scenarioKey, neutralText, maleText, femaleText });
  }
  if (items.length === 0) {
    throw new Error('Response array contained no valid domain prompt items');
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

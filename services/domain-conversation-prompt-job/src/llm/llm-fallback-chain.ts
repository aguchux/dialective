import { Logger } from '@nestjs/common';
import { LlmProvider, LlmProviderKey } from './llm-provider.interface';

// See word-generator-job's identical file for the rationale on this
// timeout -- a single hung provider call must not block the run forever.
const PROVIDER_CALL_TIMEOUT_MS = 60_000;

async function withTimeout<T>(promise: Promise<T>, key: LlmProviderKey): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`timed out after ${PROVIDER_CALL_TIMEOUT_MS}ms`)),
      PROVIDER_CALL_TIMEOUT_MS,
    );
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

/**
 * Tries providers strictly in order -- first success wins, later providers
 * in the order are never invoked. Only throws (a combined error listing
 * every failure) if every provider in the order fails.
 */
export class LlmFallbackChain {
  private readonly logger = new Logger(LlmFallbackChain.name);

  constructor(private readonly providersByKey: Record<LlmProviderKey, LlmProvider>) {}

  async generate(
    prompt: string,
    order: LlmProviderKey[],
  ): Promise<{ items: string[]; provider: LlmProviderKey }> {
    const failures: string[] = [];

    for (const key of order) {
      const provider = this.providersByKey[key];
      try {
        const items = await withTimeout(provider.generate(prompt), key);
        return { items, provider: key };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Provider "${key}" failed: ${message}`);
        failures.push(`${key}: ${message}`);
      }
    }

    throw new Error(`All LLM providers failed -- ${failures.join('; ')}`);
  }

  /** Same fallback-in-order shape as generate, but hands the provider's raw response to a caller-supplied parser -- used for the domain-prompt-item response shape. */
  async generateStructured<T>(
    prompt: string,
    order: LlmProviderKey[],
    parse: (raw: string) => T,
  ): Promise<{ items: T; provider: LlmProviderKey }> {
    const failures: string[] = [];

    for (const key of order) {
      const provider = this.providersByKey[key];
      try {
        const raw = await withTimeout(provider.generateRaw(prompt), key);
        return { items: parse(raw), provider: key };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Provider "${key}" failed: ${message}`);
        failures.push(`${key}: ${message}`);
      }
    }

    throw new Error(`All LLM providers failed -- ${failures.join('; ')}`);
  }
}

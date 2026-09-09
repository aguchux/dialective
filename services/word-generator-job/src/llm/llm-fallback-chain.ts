import { Logger } from '@nestjs/common';
import { LlmProvider, LlmProviderKey } from './llm-provider.interface';

// No provider SDK here is configured with its own request timeout, and a
// single hung call (a network stall, a provider silently never responding)
// blocks the ENTIRE run indefinitely -- this job's per-dialect translation
// loops make many sequential calls per scheduled run, so one stuck call
// anywhere in that loop freezes generation until the pod is killed. A
// generous but finite ceiling here guarantees a slow/stuck provider always
// gets treated as a failure (falls through to the next provider in the
// chain, or the whole run's try/catch) rather than hanging forever.
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
 * every failure) if every provider in the order fails. Never calls all
 * providers, never round-robins -- the admin-configured order is a
 * fallback chain, not a fan-out.
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

  /** Same fallback-in-order shape as generate, but hands the provider's raw response to a caller-supplied parser -- used for the {text, partOfSpeech} response shape. */
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

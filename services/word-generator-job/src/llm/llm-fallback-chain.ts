import { Logger } from '@nestjs/common';
import { LlmProvider, LlmProviderKey } from './llm-provider.interface';

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

  async generate(prompt: string, order: LlmProviderKey[]): Promise<{ items: string[]; provider: LlmProviderKey }> {
    const failures: string[] = [];

    for (const key of order) {
      const provider = this.providersByKey[key];
      try {
        const items = await provider.generate(prompt);
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
        const raw = await provider.generateRaw(prompt);
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

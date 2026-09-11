import { Logger } from '@nestjs/common';
import { LlmProvider, LlmProviderKey } from './llm-provider.interface';

/**
 * Tries providers strictly in order -- first success wins, later providers
 * in the order are never invoked. Only throws (a combined error listing
 * every failure) if every provider in the order fails. Mirrors
 * word-generator-job's LlmFallbackChain, adapted for the single-string
 * normalize() shape.
 */
export class LlmFallbackChain {
  private readonly logger = new Logger(LlmFallbackChain.name);

  constructor(private readonly providersByKey: Record<LlmProviderKey, LlmProvider>) {}

  async normalize(
    prompt: string,
    order: LlmProviderKey[],
  ): Promise<{ text: string; provider: LlmProviderKey }> {
    const failures: string[] = [];

    for (const key of order) {
      const provider = this.providersByKey[key];
      try {
        const text = await provider.normalize(prompt);
        return { text, provider: key };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Provider "${key}" failed: ${message}`);
        failures.push(`${key}: ${message}`);
      }
    }

    throw new Error(`All LLM providers failed -- ${failures.join('; ')}`);
  }

  /**
   * Like normalize(), but for providers whose describeImage() capability is
   * actually implemented (OpenAI, Anthropic) -- a provider without it
   * (DeepSeek) is silently skipped from `order` rather than attempted and
   * failed, since "this provider doesn't support images" isn't a
   * transient/retryable failure the way a network error is.
   */
  async describeImage(
    imageBase64: string,
    mimeType: string,
    prompt: string,
    order: LlmProviderKey[],
  ): Promise<{ text: string; provider: LlmProviderKey }> {
    const failures: string[] = [];
    const imageCapableOrder = order.filter((key) => typeof this.providersByKey[key].describeImage === 'function');

    if (imageCapableOrder.length === 0) {
      throw new Error('No image-capable LLM provider is configured in this order');
    }

    for (const key of imageCapableOrder) {
      const provider = this.providersByKey[key];
      try {
        const text = await provider.describeImage!(imageBase64, mimeType, prompt);
        return { text, provider: key };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Provider "${key}" describeImage failed: ${message}`);
        failures.push(`${key}: ${message}`);
      }
    }

    throw new Error(`All image-capable LLM providers failed -- ${failures.join('; ')}`);
  }
}

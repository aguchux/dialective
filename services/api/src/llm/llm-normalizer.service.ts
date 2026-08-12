import { Injectable } from '@nestjs/common';
import { AnthropicProvider } from './anthropic.provider';
import { DeepSeekProvider } from './deepseek.provider';
import { LlmFallbackChain } from './llm-fallback-chain';
import { LlmProvider, LlmProviderKey } from './llm-provider.interface';
import { OpenAiProvider } from './openai.provider';

/**
 * Thin injectable wrapper around LlmFallbackChain for services/api's two
 * single-string-normalization use cases (spelling normalization, admin
 * keyboard-layout drafting). Mirrors word-generator-job's
 * WordGeneratorService constructor pattern for building the provider map,
 * duplicated here rather than shared since word-generator-job is a
 * separate deployable service.
 */
@Injectable()
export class LlmNormalizerService {
  private readonly providersByKey: Record<LlmProviderKey, LlmProvider>;
  private readonly chain: LlmFallbackChain;

  constructor() {
    this.providersByKey = {
      openai: new OpenAiProvider(),
      deepseek: new DeepSeekProvider(),
      anthropic: new AnthropicProvider(),
    };
    this.chain = new LlmFallbackChain(this.providersByKey);
  }

  async normalize(prompt: string, order: LlmProviderKey[]): Promise<string> {
    const { text } = await this.chain.normalize(prompt, order);
    return text;
  }
}

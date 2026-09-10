import Anthropic from '@anthropic-ai/sdk';
import { LlmProvider, parseJsonStringArray } from './llm-provider.interface';

// See word-generator-job's identical provider for why this specific model
// id -- claude-3-5-haiku-latest was retired/renamed; this is the current
// cheapest/fastest tier.
const MODEL = 'claude-haiku-4-5-20251001';

export class AnthropicProvider implements LlmProvider {
  readonly key = 'anthropic' as const;

  async generate(prompt: string): Promise<string[]> {
    return parseJsonStringArray(await this.generateRaw(prompt));
  }

  async generateRaw(prompt: string): Promise<string> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 2048,
      temperature: 0.9,
      system:
        'You respond with ONLY a raw JSON array. No markdown fences, no prose, no explanation -- the entire response body must be valid JSON parseable by JSON.parse().',
      messages: [{ role: 'user', content: prompt }],
    });
    const block = message.content.find((item) => item.type === 'text');
    if (!block || block.type !== 'text') throw new Error('Anthropic response had no text content');
    return block.text;
  }
}

import Anthropic from '@anthropic-ai/sdk';
import { LlmProvider } from './llm-provider.interface';

const MODEL = 'claude-3-5-haiku-latest';

export class AnthropicProvider implements LlmProvider {
  readonly key = 'anthropic' as const;

  async normalize(prompt: string): Promise<string> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 512,
      temperature: 0.3,
      system: 'You respond with ONLY the requested plain-text answer. No markdown, no quotes, no explanation, no prose beyond the answer itself.',
      messages: [{ role: 'user', content: prompt }],
    });
    const block = message.content.find((item) => item.type === 'text');
    const text = block && block.type === 'text' ? block.text.trim() : '';
    if (!text) throw new Error('Anthropic response had no text content');
    return text;
  }
}

import Anthropic from '@anthropic-ai/sdk';
import { LlmProvider } from './llm-provider.interface';

// claude-3-5-haiku-latest was retired/renamed and started 404ing on every
// call (confirmed via a live GET /v1/models call against production's own
// key -- that model id no longer appears in the account's available list).
// claude-haiku-4-5-20251001 is the current cheapest/fastest tier, matching
// this provider's original choice of "Haiku" for cheap normalization calls.
const MODEL = 'claude-haiku-4-5-20251001';

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
      system:
        'You respond with ONLY the requested plain-text answer. No markdown, no quotes, no explanation, no prose beyond the answer itself.',
      messages: [{ role: 'user', content: prompt }],
    });
    const block = message.content.find((item) => item.type === 'text');
    const text = block && block.type === 'text' ? block.text.trim() : '';
    if (!text) throw new Error('Anthropic response had no text content');
    return text;
  }

  async describeImage(imageBase64: string, mimeType: string, prompt: string): Promise<string> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 512,
      temperature: 0.2,
      system:
        'You respond with ONLY the requested plain-text answer. No markdown, no quotes, no explanation, no prose beyond the answer itself.',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mimeType as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif',
                data: imageBase64,
              },
            },
            { type: 'text', text: prompt },
          ],
        },
      ],
    });
    const block = message.content.find((item) => item.type === 'text');
    const text = block && block.type === 'text' ? block.text.trim() : '';
    if (!text) throw new Error('Anthropic response had no text content');
    return text;
  }
}

import OpenAI from 'openai';
import { LlmProvider } from './llm-provider.interface';

const MODEL = 'gpt-4o-mini';

export class OpenAiProvider implements LlmProvider {
  readonly key = 'openai' as const;

  async normalize(prompt: string): Promise<string> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY not set');

    const client = new OpenAI({ apiKey });
    const completion = await client.chat.completions.create({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
    });
    const content = completion.choices[0]?.message?.content?.trim();
    if (!content) throw new Error('OpenAI response had no content');
    return content;
  }

  async describeImage(imageBase64: string, mimeType: string, prompt: string): Promise<string> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY not set');

    const client = new OpenAI({ apiKey });
    const completion = await client.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
          ],
        },
      ],
      temperature: 0.2,
    });
    const content = completion.choices[0]?.message?.content?.trim();
    if (!content) throw new Error('OpenAI response had no content');
    return content;
  }
}

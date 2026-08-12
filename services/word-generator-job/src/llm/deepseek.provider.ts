import OpenAI from 'openai';
import { LlmProvider, parseJsonStringArray } from './llm-provider.interface';

const MODEL = 'deepseek-chat';

// DeepSeek's chat API is OpenAI-SDK-compatible -- same client, different
// baseURL/key/model.
export class DeepSeekProvider implements LlmProvider {
  readonly key = 'deepseek' as const;

  async generate(prompt: string): Promise<string[]> {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) throw new Error('DEEPSEEK_API_KEY not set');

    const client = new OpenAI({ apiKey, baseURL: 'https://api.deepseek.com' });
    const completion = await client.chat.completions.create({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.9,
    });
    const content = completion.choices[0]?.message?.content;
    if (!content) throw new Error('DeepSeek response had no content');
    return parseJsonStringArray(content);
  }
}

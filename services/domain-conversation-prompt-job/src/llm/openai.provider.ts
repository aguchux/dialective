import OpenAI from 'openai';
import { LlmProvider, parseJsonStringArray } from './llm-provider.interface';

const MODEL = 'gpt-4o-mini';

export class OpenAiProvider implements LlmProvider {
  readonly key = 'openai' as const;

  async generate(prompt: string): Promise<string[]> {
    return parseJsonStringArray(await this.generateRaw(prompt));
  }

  async generateRaw(prompt: string): Promise<string> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY not set');

    const client = new OpenAI({ apiKey });
    const completion = await client.chat.completions.create({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.9,
    });
    const content = completion.choices[0]?.message?.content;
    if (!content) throw new Error('OpenAI response had no content');
    return content;
  }
}

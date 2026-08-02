import { Controller, Get, Query } from '@nestjs/common';
import { randomUUID } from 'crypto';

/**
 * Fixed text-only prompt bank for the no-auth end-to-end test flow. Not a
 * replacement for the real prompts schema (Project Plan step 2) -- once that
 * exists, this becomes a Postgres-backed prompt picker instead. No TTS here;
 * see AGENTS.md "MMS-TTS boundary" for why prompt-audio synthesis stays a
 * separate, queue-driven concern.
 */
const PROMPTS_BY_DIALECT: Record<string, string[]> = {
  'en-us': [
    'The quick brown fox jumps over the lazy dog.',
    'Please call Stella and ask her to bring these things.',
    'The rainbow is a division of white light into many beautiful colors.',
    'A pot of tea helps to pass the evening.',
  ],
};

@Controller('prompts')
export class PromptsController {
  @Get('random')
  getRandom(@Query('dialectTag') dialectTagRaw?: string) {
    const dialectTag = dialectTagRaw ?? 'en-us';
    const bank = PROMPTS_BY_DIALECT[dialectTag] ?? PROMPTS_BY_DIALECT['en-us'];
    const text = bank[Math.floor(Math.random() * bank.length)];

    return { promptId: randomUUID(), dialectTag, text };
  }
}

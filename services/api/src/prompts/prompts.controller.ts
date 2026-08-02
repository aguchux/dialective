import { Controller, Get, Query, UnprocessableEntityException } from '@nestjs/common';
import { randomUUID } from 'crypto';

/**
 * Fixed text-only prompt bank for the no-auth end-to-end test flow. Not a
 * replacement for the real prompts schema (Project Plan step 2) -- once that
 * exists, this becomes a Postgres-backed prompt picker instead. No TTS here;
 * see AGENTS.md "MMS-TTS boundary" for why prompt-audio synthesis stays a
 * separate, queue-driven concern.
 *
 * Every dialect_tag here must also have an entry in
 * models/asr-registry.yaml -- a prompt with nowhere for its transcript to
 * be scored would be pointless to hand out. Non-English sentences sourced
 * from beginner-phrase references (Omniglot, learnentry.com), not invented,
 * since a wrong prompt would actively mislead a trainer learning the
 * language.
 */
const PROMPTS_BY_DIALECT: Record<string, string[]> = {
  'en-us': [
    'The quick brown fox jumps over the lazy dog.',
    'Please call Stella and ask her to bring these things.',
    'The rainbow is a division of white light into many beautiful colors.',
    'A pot of tea helps to pass the evening.',
  ],
  ig: ['Kedu ka ị mere?', 'Aha m bụ Alex.', 'Obi dị m ụtọ.', 'Daalụ nke ukwuu.'],
  yo: ['Bawo ni o se wa?', 'Mo wa dada, ese.', 'Ese gan.', 'Ko ye mi.'],
  ha: ['Yaya lafiya?', 'Sannu abokina.', 'Ina kwana?', 'Na gode sosai.'],
};

@Controller('prompts')
export class PromptsController {
  @Get('random')
  getRandom(@Query('dialectTag') dialectTagRaw?: string) {
    const dialectTag = dialectTagRaw ?? 'en-us';
    const bank = PROMPTS_BY_DIALECT[dialectTag];
    if (!bank) {
      throw new UnprocessableEntityException(`Unsupported dialect: ${dialectTag}`);
    }
    const text = bank[Math.floor(Math.random() * bank.length)];

    return { promptId: randomUUID(), dialectTag, text };
  }
}

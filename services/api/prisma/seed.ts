import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@dialectiva/db';
import { AFRICA_COUNTRIES, CountrySeed } from './africa-countries-dialects';

// Fixed word bank for the word-library flow (AGENTS.md "Word library").
// Adding a word means adding it here and re-running `npm run prisma:seed` --
// there is no admin UI for this by design (see the design discussion this
// flow was scoped from).
const WORDS = [
  'water',
  'food',
  'house',
  'family',
  'friend',
  'love',
  'peace',
  'work',
  'money',
  'time',
  'day',
  'night',
  'sun',
  'moon',
  'rain',
  'fire',
  'earth',
  'tree',
  'river',
  'mountain',
  'child',
  'mother',
  'father',
  'sister',
  'brother',
  'man',
  'woman',
  'name',
  'school',
  'teacher',
  'student',
  'book',
  'market',
  'farm',
  'village',
  'city',
  'road',
  'car',
  'bicycle',
  'animal',
  'dog',
  'cat',
  'bird',
  'fish',
  'goat',
  'chicken',
  'rice',
  'bread',
  'meat',
  'fruit',
  'health',
  'hospital',
  'doctor',
  'medicine',
  'church',
  'prayer',
  'king',
  'chief',
  'law',
  'yes',
  'no',
  'please',
  'thank you',
  'sorry',
  'good morning',
  'good night',
  'welcome',
  'goodbye',
  'one',
  'two',
  'three',
  'ten',
  'hundred',
  'big',
  'small',
  'good',
  'bad',
  'happy',
  'sad',
  'hot',
  'cold',
  'fast',
  'slow',
];

// Seed English Sentence bank for word-training's ENGLISH_TO_DIALECT
// escalation (see WordsService.pickSentenceSource) -- always English, the
// trainer records their own dialect from their own fluency. Non-English
// per-dialect content no longer applies (dictation/Prompt were retired).
const SEED_SENTENCES: string[] = [
  'The quick brown fox jumps over the lazy dog.',
  'Please call Stella and ask her to bring these things.',
  'The rainbow is a division of white light into many beautiful colors.',
  'A pot of tea helps to pass the evening.',
];

// Real sub-dialect seed data (see DialectVariant in schema.prisma) -- keyed
// by parent dialect tag, not country, since a variant belongs to a dialect.
// Only Igbo has entries today; any dialect can gain its own list here later
// without a schema change. Every dialect (not just ones listed here) also
// gets a synthetic "Basic <Name>" variant -- see the dialectId loop below --
// so a dialect with no real sub-dialects still offers exactly one selectable
// subdialect, keeping "every trainer must pick a subdialect" uniform across
// all 200+ dialects instead of only the handful with real variants.
const DIALECT_VARIANTS_BY_TAG: Record<string, { tag: string; name: string }[]> = {
  ig: [
    { tag: 'izzi', name: 'Izzi' },
    { tag: 'ezza', name: 'Ezza' },
    { tag: 'ezeagu', name: 'Ezeagu' },
  ],
};

// Onboarding country/dialect list: all African Union member countries
// (africa-countries-dialects.ts) plus the United States, kept for the
// `en-us` tag Sentence content is always seeded under. Nigeria's ig/yo/ha
// tags here match the tags used by WordRecording -- not new dialects, just
// the same values as real rows.
const COUNTRIES: CountrySeed[] = [
  ...AFRICA_COUNTRIES,
  { code: 'US', name: 'United States', dialects: [{ tag: 'en-us', name: 'English (US)' }] },
];

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  try {
    const wordResult = await prisma.word.createMany({
      data: WORDS.map((text) => ({ text })),
      skipDuplicates: true,
    });

    const countryRows = await Promise.all(
      COUNTRIES.map((country) =>
        prisma.country.upsert({
          where: { code: country.code },
          create: { code: country.code, name: country.name, llmGenerationEnabled: true },
          update: { name: country.name },
        }),
      ),
    );
    const countryIds = new Map(countryRows.map((country) => [country.code, country.id]));
    const dialects = COUNTRIES.flatMap((country) =>
      country.dialects.map((dialect) => ({
        ...dialect,
        countryId: countryIds.get(country.code)!,
      })),
    );

    const dialectRows = await Promise.all(
      dialects.map((dialect) =>
        prisma.dialect.upsert({
          where: { tag: dialect.tag },
          create: {
            tag: dialect.tag,
            name: dialect.name,
            countryId: dialect.countryId,
            llmGenerationEnabled: true,
          },
          update: { name: dialect.name, countryId: dialect.countryId },
        }),
      ),
    );

    // Every dialect gets a "Basic <Name>" DialectVariant first -- the
    // required subdialect selection for dialects with no real sub-dialects
    // configured, and also offered alongside the real ones (e.g. "Basic
    // Igbo" next to Izzi/Ezza/Ezeagu) so a trainer who doesn't identify with
    // any specific sub-dialect can still pick something. tag 'basic' is
    // unique per-dialect (not globally), so every dialect reuses it safely.
    // Izzi/Ezza/Ezeagu remain mutually-intelligible Igbo sub-dialects that
    // share ig's entire word/keyboard/ASR setup; these rows only exist so
    // trainers can self-identify their specific variety, and so admin can
    // see tagged activity per variant.
    let variantsSeeded = 0;
    for (const dialect of dialectRows) {
      await prisma.dialectVariant.upsert({
        where: { dialectId_tag: { dialectId: dialect.id, tag: 'basic' } },
        create: { dialectId: dialect.id, tag: 'basic', name: `Basic ${dialect.name}` },
        update: { name: `Basic ${dialect.name}` },
      });
      variantsSeeded += 1;

      const realVariants = DIALECT_VARIANTS_BY_TAG[dialect.tag] ?? [];
      for (const variant of realVariants) {
        await prisma.dialectVariant.upsert({
          where: { dialectId_tag: { dialectId: dialect.id, tag: variant.tag } },
          create: { dialectId: dialect.id, tag: variant.tag, name: variant.name },
          update: { name: variant.name },
        });
        variantsSeeded += 1;
      }
    }

    let sentencesSeeded = 0;
    for (const text of SEED_SENTENCES) {
      const existing = await prisma.sentence.findUnique({ where: { text }, select: { id: true } });
      if (!existing) {
        await prisma.sentence.create({
          data: { text, wordCount: text.trim().split(/\s+/).length },
        });
        sentencesSeeded += 1;
      }
    }

    console.log(
      `Seeded ${COUNTRIES.length} countries, ${dialects.length} dialects, ${variantsSeeded} dialect variants, added ${wordResult.count} new words, and added ${sentencesSeeded} new sentences.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

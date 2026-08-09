import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
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

// Onboarding country/dialect list: all African Union member countries
// (africa-countries-dialects.ts) plus the United States, kept for the
// `en-us` tag already referenced by PROMPTS_BY_DIALECT. Nigeria's ig/yo/ha
// tags here match the 3 existing tags used by PromptsController and
// WordRecording -- not new dialects, just the same values as real rows.
const COUNTRIES: CountrySeed[] = [
  ...AFRICA_COUNTRIES,
  { code: 'US', name: 'United States', dialects: [
    { tag: 'en-us', name: 'English (US)' },
  ] },
];

async function main() {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  try {
    const wordResult = await prisma.word.createMany({
      data: WORDS.map((text) => ({ text })),
      skipDuplicates: true,
    });

    const countryRows = await Promise.all(
      COUNTRIES.map((country) =>
        prisma.country.upsert({
          where: { code: country.code },
          create: { code: country.code, name: country.name },
          update: { name: country.name },
        }),
      ),
    );
    const countryIds = new Map(countryRows.map((country) => [country.code, country.id]));
    const dialects = COUNTRIES.flatMap((country) => country.dialects.map((dialect) => ({
      ...dialect,
      countryId: countryIds.get(country.code)!,
    })));

    await Promise.all(
      dialects.map((dialect) =>
        prisma.dialect.upsert({
          where: { tag: dialect.tag },
          create: { tag: dialect.tag, name: dialect.name, countryId: dialect.countryId },
          update: { name: dialect.name, countryId: dialect.countryId },
        }),
      ),
    );
    console.log(
      `Seeded ${COUNTRIES.length} countries, ${dialects.length} dialects, and added ${wordResult.count} new words.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

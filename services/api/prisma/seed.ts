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
    for (const text of WORDS) {
      await prisma.word.upsert({
        where: { text },
        create: { text },
        update: {},
      });
    }
    console.log(`Seeded ${WORDS.length} words.`);

    for (const country of COUNTRIES) {
      const countryRow = await prisma.country.upsert({
        where: { code: country.code },
        create: { code: country.code, name: country.name },
        update: { name: country.name },
      });
      for (const dialect of country.dialects) {
        await prisma.dialect.upsert({
          where: { tag: dialect.tag },
          create: { tag: dialect.tag, name: dialect.name, countryId: countryRow.id },
          update: { name: dialect.name, countryId: countryRow.id },
        });
      }
    }
    console.log(`Seeded ${COUNTRIES.length} countries and their dialects.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

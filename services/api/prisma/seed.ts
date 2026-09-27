import { createHash, randomBytes } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@dialectiva/db';
import { AFRICA_COUNTRIES, CountrySeed } from './africa-countries-dialects';
import { ASIA_COUNTRIES } from './asia-countries-dialects';
import { PAYMENT_METHOD_CATALOG_SEED } from './payment-method-catalog-seed';

/**
 * Dialect Library's own Voice Stream org. The id is referenced as a constant by
 * contributor-decks.service.ts and validator-decks.service.ts -- it must stay
 * exactly this string.
 */
const PLATFORM_ORG_ID = 'dialect-library-platform';
const PLATFORM_ORG_NAME = 'Dialect Library';
const PLATFORM_ORG_SLUG = 'dialect-library';
/** Where the accept-invite link points. Override per environment. */
const PLATFORM_ORG_APP_URL = process.env.STREAM_FRONTEND_URL ?? 'https://www.streamdialect.com';
/**
 * Who gets the one bootstrap OWNER invite, when the org has no members yet.
 * Unset means no invite is issued -- the org is still created.
 */
const PLATFORM_ORG_BOOTSTRAP_EMAIL = process.env.STREAM_BOOTSTRAP_OWNER_EMAIL ?? '';
const BOOTSTRAP_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

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

// Onboarding country/dialect list: African and Asian country catalogues,
// plus the United States, kept for the
// `en-us` tag Sentence content is always seeded under. Nigeria's ig/yo/ha
// tags here match the tags used by WordRecording -- not new dialects, just
// the same values as real rows.
const COUNTRIES: CountrySeed[] = [
  ...AFRICA_COUNTRIES,
  ...ASIA_COUNTRIES,
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

    let paymentMethodsSeeded = 0;
    for (const method of PAYMENT_METHOD_CATALOG_SEED) {
      const existing = await prisma.paymentMethodCatalog.findFirst({
        where: { countryCode: method.countryCode, type: method.type, name: method.name },
        select: { id: true },
      });
      if (!existing) {
        await prisma.paymentMethodCatalog.create({
          data: {
            countryCode: method.countryCode,
            type: method.type,
            name: method.name,
            bankCode: method.bankCode,
            sortOrder: method.sortOrder,
          },
        });
        paymentMethodsSeeded += 1;
      }
    }

    // --- Dialect Library's own Voice Stream organisation ------------------
    //
    // This org is what contributor decks are published under
    // (DIALECT_LIBRARY_PLATFORM_ORG_ID in vdcl/decks/contributor-decks.service.ts
    // and validator-decks/validator-decks.service.ts), so a contributor's deck
    // reaches Stream without that contributor ever being given a subscriber
    // identity. Its id is a FIXED STRING, not a uuid, because those services
    // reference it as a constant -- never change it, and never let the seed
    // create a second one.
    //
    // Fields other than the name are left alone on update: this org may be
    // edited through the normal org settings UI once someone can sign in, and
    // re-running the seed must not revert that.
    const platformOrg = await prisma.subscriberOrganization.upsert({
      where: { id: PLATFORM_ORG_ID },
      create: {
        id: PLATFORM_ORG_ID,
        name: PLATFORM_ORG_NAME,
        slug: PLATFORM_ORG_SLUG,
        description:
          "Dialect Library's own organisation on Voice Stream. Contributor licence decks are published under this org so a contributor never needs a subscriber account.",
        supportEmail: 'hello@dialectlibrary.com',
        website: 'https://www.dialectlibrary.com',
      },
      update: { name: PLATFORM_ORG_NAME },
    });

    // Bootstrap the first OWNER by INVITE, never by writing a password.
    //
    // Two reasons it has to be an invite:
    //
    // 1. There is a genuine chicken-and-egg. inviteMember() refuses to create
    //    an OWNER unless the inviter is already an OWNER of that org, and this
    //    org has no members at all -- so no invite can ever be issued through
    //    the API. The seed is the only place that can break that cycle.
    //
    // 2. A seeded SubscriberUser with passwordHash null could neither log in
    //    nor recover: login() and requestPasswordReset() BOTH return early on
    //    `!user.passwordHash` (the SSO-only case), and the reset path does so
    //    silently to avoid leaking account type. So seeding a member without a
    //    password produces an account that looks fine and can never be used.
    //    acceptInvite(token, password) is the designed path -- the invitee sets
    //    their own password, and no credential is ever written into this repo,
    //    a commit, or a log.
    //
    // Idempotent: skipped entirely once the org has any accepted membership,
    // and an unaccepted invite is refreshed rather than duplicated.
    const existingMembers = await prisma.subscriberMembership.count({
      where: { organizationId: platformOrg.id, acceptedAt: { not: null } },
    });

    let bootstrapNote = `org "${platformOrg.name}" present, ${existingMembers} member(s)`;

    if (existingMembers === 0 && PLATFORM_ORG_BOOTSTRAP_EMAIL) {
      const email = PLATFORM_ORG_BOOTSTRAP_EMAIL.trim().toLowerCase();
      // A pending invite is reissued with a fresh token/expiry rather than
      // added to, so re-running the seed cannot leave several live tokens for
      // one address.
      await prisma.subscriberInvite.deleteMany({
        where: { organizationId: platformOrg.id, email, acceptedAt: null },
      });
      const token = randomBytes(32).toString('base64url');
      await prisma.subscriberInvite.create({
        data: {
          organizationId: platformOrg.id,
          email,
          role: 'OWNER',
          tokenHash: createHash('sha256').update(token).digest('hex'),
          // invitedByUserId has no FK to SubscriberUser, so the bootstrap
          // invite can name its origin instead of a person who does not exist
          // yet. Anything that displays an inviter must tolerate this value.
          invitedByUserId: 'seed-bootstrap',
          expiresAt: new Date(Date.now() + BOOTSTRAP_INVITE_TTL_MS),
        },
      });
      // Printed, never persisted in plaintext: only its sha256 is stored, the
      // same shape as every other opaque token in this codebase.
      bootstrapNote =
        `org "${platformOrg.name}" has no members -- issued an OWNER invite for ${email}.
` +
        `  Accept within 7 days at: ${PLATFORM_ORG_APP_URL}/register/accept-invite?token=${token}
` +
        `  The invitee sets their own password there; this seed never writes one.`;
    }

    console.log(
      `Seeded ${COUNTRIES.length} countries, ${dialects.length} dialects, ${variantsSeeded} dialect variants, added ${wordResult.count} new words, added ${sentencesSeeded} new sentences, and added ${paymentMethodsSeeded} new payment methods.`,
    );
    console.log(`Voice Stream platform org: ${bootstrapNote}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

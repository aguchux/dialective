import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient } from '@dialectiva/db';
import { createTestApp, apiPath, closeTestApp } from './support/test-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { seedOrg, seedDeck, seedStreamKey, cleanupOrgs, SeededOrg } from './support/fixtures';

/**
 * Section 64: "rate-limit tests". otp/resend is the fastest, most
 * deterministic rate-limit target in the app: @Throttle({limit:3,
 * ttl:10*60*1000}) on an unauthenticated route, so only 4 requests are
 * needed to prove the 4th is blocked -- versus the global 60/60s default
 * elsewhere, which would need 61 requests per test.
 */
describe('rate limiting', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let org: SeededOrg;
  const orgIds: string[] = [];

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    org = await seedOrg(prisma);
    orgIds.push(org.organizationId);
  });

  afterAll(async () => {
    await cleanupOrgs(prisma, orgIds);
    await closeTestApp(app);
  });

  it('blocks the 4th otp/resend request within the 10-minute window with 429', async () => {
    const results: number[] = [];
    for (let i = 0; i < 4; i++) {
      const res = await request(app.getHttpServer())
        .post(apiPath('voice-stream/auth/otp/resend'))
        .send({ ticket: `not-a-real-ticket-${i}` });
      results.push(res.status);
    }
    // First 3 pass the throttle guard (their actual outcome depends on the
    // bogus ticket -- likely 400/404 from the handler, that's fine, the
    // guard runs before the handler either way). The 4th must be 429.
    expect(results[3]).toBe(429);
    expect(results.slice(0, 3)).not.toContain(429);
  });

  describe('StreamKeyRateLimitGuard tracks per-key, not per-org', () => {
    it('exhausting one key does not affect a second key from the same org', async () => {
      const orgWithTightLimit = await seedOrg(prisma, { planOverrides: { rateLimitPerMinute: 1 } });
      orgIds.push(orgWithTightLimit.organizationId);
      const deck = await seedDeck(
        prisma,
        orgWithTightLimit.organizationId,
        orgWithTightLimit.userId,
      );
      const keyA = await seedStreamKey(
        prisma,
        orgWithTightLimit.organizationId,
        orgWithTightLimit.userId,
      );
      const keyB = await seedStreamKey(
        prisma,
        orgWithTightLimit.organizationId,
        orgWithTightLimit.userId,
      );

      const first = await request(app.getHttpServer())
        .get(apiPath(`stream/v1/decks/${deck.deckId}/manifest`))
        .set('Authorization', `Bearer ${keyA.plaintextKey}`);
      expect(first.status).toBe(200);

      const second = await request(app.getHttpServer())
        .get(apiPath(`stream/v1/decks/${deck.deckId}/manifest`))
        .set('Authorization', `Bearer ${keyA.plaintextKey}`);
      expect(second.status).toBe(429);

      // Key B, same org, same tight plan limit -- independent bucket.
      const thirdDifferentKey = await request(app.getHttpServer())
        .get(apiPath(`stream/v1/decks/${deck.deckId}/manifest`))
        .set('Authorization', `Bearer ${keyB.plaintextKey}`);
      expect(thirdDifferentKey.status).toBe(200);
    });
  });
});

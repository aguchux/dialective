'use strict';
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod };
  };
Object.defineProperty(exports, '__esModule', { value: true });
const supertest_1 = __importDefault(require('supertest'));
const test_app_1 = require('./support/test-app');
const prisma_service_1 = require('../src/prisma/prisma.service');
const fixtures_1 = require('./support/fixtures');
/**
 * Section 64: "rate-limit tests". otp/resend is the fastest, most
 * deterministic rate-limit target in the app: @Throttle({limit:3,
 * ttl:10*60*1000}) on an unauthenticated route, so only 4 requests are
 * needed to prove the 4th is blocked -- versus the global 60/60s default
 * elsewhere, which would need 61 requests per test.
 */
describe('rate limiting', () => {
  let app;
  let prisma;
  let org;
  const orgIds = [];
  beforeAll(async () => {
    app = await (0, test_app_1.createTestApp)();
    prisma = app.get(prisma_service_1.PrismaService);
    org = await (0, fixtures_1.seedOrg)(prisma);
    orgIds.push(org.organizationId);
  });
  afterAll(async () => {
    await (0, fixtures_1.cleanupOrgs)(prisma, orgIds);
    await (0, test_app_1.closeTestApp)(app);
  });
  it('blocks the 4th otp/resend request within the 10-minute window with 429', async () => {
    const results = [];
    for (let i = 0; i < 4; i++) {
      const res = await (0, supertest_1.default)(app.getHttpServer())
        .post((0, test_app_1.apiPath)('voice-stream/auth/otp/resend'))
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
      const orgWithTightLimit = await (0, fixtures_1.seedOrg)(prisma, {
        planOverrides: { rateLimitPerMinute: 1 },
      });
      orgIds.push(orgWithTightLimit.organizationId);
      const deck = await (0, fixtures_1.seedDeck)(
        prisma,
        orgWithTightLimit.organizationId,
        orgWithTightLimit.userId,
      );
      const keyA = await (0, fixtures_1.seedStreamKey)(
        prisma,
        orgWithTightLimit.organizationId,
        orgWithTightLimit.userId,
      );
      const keyB = await (0, fixtures_1.seedStreamKey)(
        prisma,
        orgWithTightLimit.organizationId,
        orgWithTightLimit.userId,
      );
      const first = await (0, supertest_1.default)(app.getHttpServer())
        .get((0, test_app_1.apiPath)(`stream/v1/decks/${deck.deckId}/manifest`))
        .set('Authorization', `Bearer ${keyA.plaintextKey}`);
      expect(first.status).toBe(200);
      const second = await (0, supertest_1.default)(app.getHttpServer())
        .get((0, test_app_1.apiPath)(`stream/v1/decks/${deck.deckId}/manifest`))
        .set('Authorization', `Bearer ${keyA.plaintextKey}`);
      expect(second.status).toBe(429);
      // Key B, same org, same tight plan limit -- independent bucket.
      const thirdDifferentKey = await (0, supertest_1.default)(app.getHttpServer())
        .get((0, test_app_1.apiPath)(`stream/v1/decks/${deck.deckId}/manifest`))
        .set('Authorization', `Bearer ${keyB.plaintextKey}`);
      expect(thirdDifferentKey.status).toBe(200);
    });
  });
});
//# sourceMappingURL=rate-limit.e2e-spec.js.map

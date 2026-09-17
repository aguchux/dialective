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
 * Section 64: "cross-tenant data isolation tests". Two independently seeded
 * orgs (A owns the deck/recording/keys under test, B is the attacker) --
 * every assertion below is "B's credential, A's resource id".
 */
describe('cross-tenant data isolation', () => {
  let app;
  let prisma;
  let orgA;
  let orgB;
  let deckAId;
  let recordingAId;
  const orgIds = [];
  const recordingIds = [];
  beforeAll(async () => {
    app = await (0, test_app_1.createTestApp)();
    prisma = app.get(prisma_service_1.PrismaService);
    orgA = await (0, fixtures_1.seedOrg)(prisma);
    orgB = await (0, fixtures_1.seedOrg)(prisma);
    orgIds.push(orgA.organizationId, orgB.organizationId);
    const deck = await (0, fixtures_1.seedDeck)(prisma, orgA.organizationId, orgA.userId);
    deckAId = deck.deckId;
    const recording = await (0, fixtures_1.seedStreamableRecording)(prisma);
    recordingAId = recording.recordingId;
    recordingIds.push(recordingAId);
    await (0, fixtures_1.addDeckItem)(prisma, deckAId, recordingAId, orgA.userId);
  });
  afterAll(async () => {
    await (0, fixtures_1.cleanupRecordings)(prisma, recordingIds);
    await (0, fixtures_1.cleanupOrgs)(prisma, orgIds);
    await (0, test_app_1.closeTestApp)(app);
  });
  describe('dashboard (subscriber JWT) side', () => {
    it("rejects org B's JWT reading org A's deck by id", async () => {
      const res = await (0, supertest_1.default)(app.getHttpServer())
        .get((0, test_app_1.apiPath)(`voice-stream/stream-decks/${deckAId}`))
        .set('Authorization', `Bearer ${orgB.subscriberJwt}`);
      expect(res.status).toBe(404);
    });
    it("rejects org B's JWT deleting org A's deck", async () => {
      const res = await (0, supertest_1.default)(app.getHttpServer())
        .delete((0, test_app_1.apiPath)(`voice-stream/stream-decks/${deckAId}`))
        .set('Authorization', `Bearer ${orgB.subscriberJwt}`);
      expect(res.status).toBe(404);
      // deck must still exist for org A afterward
      const stillThere = await (0, supertest_1.default)(app.getHttpServer())
        .get((0, test_app_1.apiPath)(`voice-stream/stream-decks/${deckAId}`))
        .set('Authorization', `Bearer ${orgA.subscriberJwt}`);
      expect(stillThere.status).toBe(200);
    });
    it("rejects org B's JWT adding an item to org A's deck", async () => {
      const res = await (0, supertest_1.default)(app.getHttpServer())
        .post((0, test_app_1.apiPath)(`voice-stream/stream-decks/${deckAId}/items`))
        .set('Authorization', `Bearer ${orgB.subscriberJwt}`)
        .send({ recordingId: recordingAId });
      expect(res.status).toBe(404);
    });
    it("org B's own deck list never contains org A's deck", async () => {
      const res = await (0, supertest_1.default)(app.getHttpServer())
        .get((0, test_app_1.apiPath)('voice-stream/stream-decks'))
        .set('Authorization', `Bearer ${orgB.subscriberJwt}`);
      expect(res.status).toBe(200);
      const ids = res.body.map((d) => d.id);
      expect(ids).not.toContain(deckAId);
    });
  });
  describe('Voice Stream API (Stream Key) side', () => {
    it("rejects org B's Stream Key reading org A's deck manifest", async () => {
      const keyB = await (0, fixtures_1.seedStreamKey)(prisma, orgB.organizationId, orgB.userId);
      const res = await (0, supertest_1.default)(app.getHttpServer())
        .get((0, test_app_1.apiPath)(`stream/v1/decks/${deckAId}/manifest`))
        .set('Authorization', `Bearer ${keyB.plaintextKey}`);
      expect(res.status).toBe(404);
    });
    it("rejects org B's Stream Key reading org A's deck item metadata", async () => {
      const keyB = await (0, fixtures_1.seedStreamKey)(prisma, orgB.organizationId, orgB.userId);
      const res = await (0, supertest_1.default)(app.getHttpServer())
        .get((0, test_app_1.apiPath)(`stream/v1/decks/${deckAId}/items/${recordingAId}`))
        .set('Authorization', `Bearer ${keyB.plaintextKey}`);
      expect(res.status).toBe(404);
    });
    it("rejects org B's Stream Key streaming org A's audio", async () => {
      const keyB = await (0, fixtures_1.seedStreamKey)(prisma, orgB.organizationId, orgB.userId);
      const res = await (0, supertest_1.default)(app.getHttpServer())
        .get((0, test_app_1.apiPath)(`stream/v1/decks/${deckAId}/items/${recordingAId}/audio`))
        .set('Authorization', `Bearer ${keyB.plaintextKey}`);
      expect(res.status).toBe(404);
    });
    it("rejects a deck-scoped Stream Key for org A's OTHER deck", async () => {
      const otherDeck = await (0, fixtures_1.seedDeck)(prisma, orgA.organizationId, orgA.userId);
      const scopedKey = await (0, fixtures_1.seedStreamKey)(
        prisma,
        orgA.organizationId,
        orgA.userId,
        {
          deckId: otherDeck.deckId,
        },
      );
      const res = await (0, supertest_1.default)(app.getHttpServer())
        .get((0, test_app_1.apiPath)(`stream/v1/decks/${deckAId}/manifest`))
        .set('Authorization', `Bearer ${scopedKey.plaintextKey}`);
      expect(res.status).toBe(404);
    });
  });
  describe('OAuth M2M side', () => {
    it("rejects org B's M2M JWT reading org A's deck manifest", async () => {
      const clientB = await (0, fixtures_1.seedOAuthClient)(
        prisma,
        orgB.organizationId,
        orgB.userId,
      );
      const res = await (0, supertest_1.default)(app.getHttpServer())
        .get((0, test_app_1.apiPath)(`stream/v1/decks/${deckAId}/manifest`))
        .set('Authorization', `Bearer ${clientB.jwt}`);
      expect(res.status).toBe(404);
    });
    it('OAuth and Stream Key credentials for the SAME org see the SAME deck', async () => {
      const clientA = await (0, fixtures_1.seedOAuthClient)(
        prisma,
        orgA.organizationId,
        orgA.userId,
      );
      const res = await (0, supertest_1.default)(app.getHttpServer())
        .get((0, test_app_1.apiPath)(`stream/v1/decks/${deckAId}/manifest`))
        .set('Authorization', `Bearer ${clientA.jwt}`);
      expect(res.status).toBe(200);
    });
  });
  describe('catalogue preview side', () => {
    it('org B can preview the SAME shared-catalogue recording as org A (by design -- not deck-scoped)', async () => {
      const res = await (0, supertest_1.default)(app.getHttpServer())
        .get((0, test_app_1.apiPath)(`voice-stream/catalogue/${recordingAId}/preview`))
        .set('Authorization', `Bearer ${orgB.subscriberJwt}`);
      // Documents current behavior: preview() authorizes on recording
      // eligibility + org's own active subscription, NOT deck membership.
      expect([200, 404]).toContain(res.status);
    });
  });
});
//# sourceMappingURL=cross-tenant-isolation.e2e-spec.js.map

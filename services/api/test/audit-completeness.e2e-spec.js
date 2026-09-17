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
 * Section 64: "audit completeness tests". OrgActivityService.record() is
 * called from stream-keys.service.ts (create/revoke/rotate) and
 * oauth-clients.service.ts (create/revoke) -- confirmed instrumented.
 * StreamDecksService calls it NOWHERE: create/rename/remove/addItem/
 * removeItem/updateRule all mutate state with zero OrgActivityEvent rows
 * written. This is a real, confirmed gap, not a hypothesis -- the tests
 * below document it explicitly so a future fix is visible as an intentional
 * change (these assertions flip) rather than a silent regression either way.
 */
describe('audit completeness', () => {
  let app;
  let prisma;
  let org;
  const orgIds = [];
  const recordingIds = [];
  async function activityCount(organizationId) {
    return prisma.orgActivityEvent.count({ where: { organizationId } });
  }
  beforeAll(async () => {
    app = await (0, test_app_1.createTestApp)();
    prisma = app.get(prisma_service_1.PrismaService);
    org = await (0, fixtures_1.seedOrg)(prisma);
    orgIds.push(org.organizationId);
  });
  afterAll(async () => {
    await (0, fixtures_1.cleanupRecordings)(prisma, recordingIds);
    await (0, fixtures_1.cleanupOrgs)(prisma, orgIds);
    await (0, test_app_1.closeTestApp)(app);
  });
  describe('instrumented: Stream Keys and OAuth Clients write activity events', () => {
    it('creating a Stream Key writes a KEY_CREATED activity event', async () => {
      const before = await activityCount(org.organizationId);
      const res = await (0, supertest_1.default)(app.getHttpServer())
        .post((0, test_app_1.apiPath)('voice-stream/stream-keys'))
        .set('Authorization', `Bearer ${org.subscriberJwt}`)
        .send({ scopes: ['DECK_LIST'] });
      expect(res.status).toBe(201);
      const events = await prisma.orgActivityEvent.findMany({
        where: { organizationId: org.organizationId, eventType: 'KEY_CREATED' },
      });
      expect(events.length).toBeGreaterThan(0);
      expect(await activityCount(org.organizationId)).toBeGreaterThan(before);
    });
    it('creating an OAuth client writes an OAUTH_CLIENT_CREATED activity event', async () => {
      const res = await (0, supertest_1.default)(app.getHttpServer())
        .post((0, test_app_1.apiPath)('voice-stream/oauth/clients'))
        .set('Authorization', `Bearer ${org.subscriberJwt}`)
        .send({ scopes: ['DECK_LIST'] });
      expect(res.status).toBe(201);
      const events = await prisma.orgActivityEvent.findMany({
        where: { organizationId: org.organizationId, eventType: 'OAUTH_CLIENT_CREATED' },
      });
      expect(events.length).toBeGreaterThan(0);
    });
  });
  describe('gap: StreamDecksService writes no activity events for any mutation', () => {
    it('creating a deck writes NO activity event', async () => {
      const before = await activityCount(org.organizationId);
      const res = await (0, supertest_1.default)(app.getHttpServer())
        .post((0, test_app_1.apiPath)('voice-stream/stream-decks'))
        .set('Authorization', `Bearer ${org.subscriberJwt}`)
        .send({ name: 'Audit gap test deck' });
      expect(res.status).toBe(201);
      // Documents the current gap. If StreamDecksService is later wired to
      // OrgActivityService, this assertion should flip to expect a new
      // DECK_CREATED-equivalent row -- update it then, don't just delete it.
      expect(await activityCount(org.organizationId)).toBe(before);
    });
    it('renaming, adding an item, and deleting a deck write NO activity events', async () => {
      const deck = await (0, fixtures_1.seedDeck)(prisma, org.organizationId, org.userId);
      const recording = await (0, fixtures_1.seedStreamableRecording)(prisma);
      recordingIds.push(recording.recordingId);
      const before = await activityCount(org.organizationId);
      const rename = await (0, supertest_1.default)(app.getHttpServer())
        .patch((0, test_app_1.apiPath)(`voice-stream/stream-decks/${deck.deckId}`))
        .set('Authorization', `Bearer ${org.subscriberJwt}`)
        .send({ name: 'Renamed' });
      expect(rename.status).toBe(200);
      const addItem = await (0, supertest_1.default)(app.getHttpServer())
        .post((0, test_app_1.apiPath)(`voice-stream/stream-decks/${deck.deckId}/items`))
        .set('Authorization', `Bearer ${org.subscriberJwt}`)
        .send({ recordingId: recording.recordingId });
      expect(addItem.status).toBe(201);
      const remove = await (0, supertest_1.default)(app.getHttpServer())
        .delete((0, test_app_1.apiPath)(`voice-stream/stream-decks/${deck.deckId}`))
        .set('Authorization', `Bearer ${org.subscriberJwt}`);
      expect(remove.status).toBe(200);
      expect(await activityCount(org.organizationId)).toBe(before);
    });
  });
  describe('StreamAccessLog: every manifest/audio request is logged regardless of outcome', () => {
    it('a successful manifest request produces an "allowed" StreamAccessLog row', async () => {
      const deck = await (0, fixtures_1.seedDeck)(prisma, org.organizationId, org.userId);
      const key = await (0, fixtures_1.seedStreamKey)(prisma, org.organizationId, org.userId);
      const before = await prisma.streamAccessLog.count({
        where: { organizationId: org.organizationId },
      });
      const res = await (0, supertest_1.default)(app.getHttpServer())
        .get((0, test_app_1.apiPath)(`stream/v1/decks/${deck.deckId}/manifest`))
        .set('Authorization', `Bearer ${key.plaintextKey}`);
      expect(res.status).toBe(200);
      // logRequest() is fire-and-forget (void this.accessLog.record(...)),
      // so the write can land after the response returns.
      await (0, fixtures_1.waitForCondition)(async () => {
        const count = await prisma.streamAccessLog.count({
          where: { organizationId: org.organizationId },
        });
        return count > before;
      });
      const after = await prisma.streamAccessLog.count({
        where: { organizationId: org.organizationId },
      });
      expect(after).toBe(before + 1);
      const lastLog = await prisma.streamAccessLog.findFirst({
        where: { organizationId: org.organizationId },
        orderBy: { createdAt: 'desc' },
      });
      expect(lastLog?.requestType).toBe('manifest');
      expect(lastLog?.entitlementDecision).toBe('allowed');
    });
    it('an audio stream request (allowed or denied) always produces a StreamAccessLog row', async () => {
      const deck = await (0, fixtures_1.seedDeck)(prisma, org.organizationId, org.userId);
      const key = await (0, fixtures_1.seedStreamKey)(prisma, org.organizationId, org.userId);
      const before = await prisma.streamAccessLog.count({
        where: { organizationId: org.organizationId },
      });
      // No item in this deck -> guaranteed 404 (denied:not_found_or_ineligible),
      // still must be logged.
      const res = await (0, supertest_1.default)(app.getHttpServer())
        .get(
          (0, test_app_1.apiPath)(
            `stream/v1/decks/${deck.deckId}/items/00000000-0000-0000-0000-000000000000/audio`,
          ),
        )
        .set('Authorization', `Bearer ${key.plaintextKey}`);
      expect(res.status).toBe(404);
      const after = await prisma.streamAccessLog.count({
        where: { organizationId: org.organizationId },
      });
      expect(after).toBe(before + 1);
      const lastLog = await prisma.streamAccessLog.findFirst({
        where: { organizationId: org.organizationId },
        orderBy: { createdAt: 'desc' },
      });
      expect(lastLog?.entitlementDecision).toMatch(/^denied:/);
    });
  });
});
//# sourceMappingURL=audit-completeness.e2e-spec.js.map

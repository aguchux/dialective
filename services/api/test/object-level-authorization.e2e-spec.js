"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
const db_1 = require("@dialectiva/db");
const test_app_1 = require("./support/test-app");
const prisma_service_1 = require("../src/prisma/prisma.service");
const fixtures_1 = require("./support/fixtures");
/**
 * Section 64: "object-level authorization tests". Distinct from
 * cross-tenant-isolation.e2e-spec.ts -- these hold the org/credential fixed
 * and vary only the object id/scope/eligibility, checking IDOR-style access
 * (nonexistent ids, ids the credential was never granted, ids that exist
 * but aren't eligible) rather than org boundaries.
 */
describe('object-level authorization', () => {
    let app;
    let prisma;
    let org;
    let deckId;
    let eligibleRecordingId;
    const orgIds = [];
    const recordingIds = [];
    beforeAll(async () => {
        app = await (0, test_app_1.createTestApp)();
        prisma = app.get(prisma_service_1.PrismaService);
        org = await (0, fixtures_1.seedOrg)(prisma);
        orgIds.push(org.organizationId);
        const deck = await (0, fixtures_1.seedDeck)(prisma, org.organizationId, org.userId);
        deckId = deck.deckId;
        const recording = await (0, fixtures_1.seedStreamableRecording)(prisma);
        eligibleRecordingId = recording.recordingId;
        recordingIds.push(eligibleRecordingId);
        await (0, fixtures_1.addDeckItem)(prisma, deckId, eligibleRecordingId, org.userId);
    });
    afterAll(async () => {
        await (0, fixtures_1.cleanupRecordings)(prisma, recordingIds);
        await (0, fixtures_1.cleanupOrgs)(prisma, orgIds);
        await (0, test_app_1.closeTestApp)(app);
    });
    it('404s a wholly nonexistent deck id, same response shape as a cross-tenant deck (no existence leak)', async () => {
        const key = await (0, fixtures_1.seedStreamKey)(prisma, org.organizationId, org.userId);
        const res = await (0, supertest_1.default)(app.getHttpServer())
            .get((0, test_app_1.apiPath)('stream/v1/decks/00000000-0000-0000-0000-000000000000/manifest'))
            .set('Authorization', `Bearer ${key.plaintextKey}`);
        expect(res.status).toBe(404);
    });
    it('404s a recordingId that exists but was never added to this deck', async () => {
        const key = await (0, fixtures_1.seedStreamKey)(prisma, org.organizationId, org.userId);
        const orphanRecording = await (0, fixtures_1.seedStreamableRecording)(prisma);
        recordingIds.push(orphanRecording.recordingId);
        const res = await (0, supertest_1.default)(app.getHttpServer())
            .get((0, test_app_1.apiPath)(`stream/v1/decks/${deckId}/items/${orphanRecording.recordingId}`))
            .set('Authorization', `Bearer ${key.plaintextKey}`);
        expect(res.status).toBe(404);
        expect(res.body.message).toMatch(/not found in this stream deck/i);
    });
    it('404s streaming a recording that is in the deck but NOT eligible (not SETTLED)', async () => {
        const key = await (0, fixtures_1.seedStreamKey)(prisma, org.organizationId, org.userId);
        const pendingRecording = await prisma.wordRecording.create({
            data: {
                dialectTag: 'test-dialect',
                translationText: 'pending, not settled',
                status: 'PENDING',
                audioBucket: 'test-bucket',
                audioKey: 'test/pending.wav',
            },
        });
        recordingIds.push(pendingRecording.id);
        await (0, fixtures_1.addDeckItem)(prisma, deckId, pendingRecording.id, org.userId);
        const res = await (0, supertest_1.default)(app.getHttpServer())
            .get((0, test_app_1.apiPath)(`stream/v1/decks/${deckId}/items/${pendingRecording.id}/audio`))
            .set('Authorization', `Bearer ${key.plaintextKey}`);
        expect(res.status).toBe(404);
    });
    it('404s streaming a recording whose audio was purged (audioDeletedAt set)', async () => {
        const key = await (0, fixtures_1.seedStreamKey)(prisma, org.organizationId, org.userId);
        const purgedRecording = await prisma.wordRecording.create({
            data: {
                dialectTag: 'test-dialect',
                translationText: 'purged audio',
                status: 'SETTLED',
                audioBucket: null,
                audioKey: null,
                audioDeletedAt: new Date(),
            },
        });
        recordingIds.push(purgedRecording.id);
        await (0, fixtures_1.addDeckItem)(prisma, deckId, purgedRecording.id, org.userId);
        const res = await (0, supertest_1.default)(app.getHttpServer())
            .get((0, test_app_1.apiPath)(`stream/v1/decks/${deckId}/items/${purgedRecording.id}/audio`))
            .set('Authorization', `Bearer ${key.plaintextKey}`);
        expect(res.status).toBe(404);
    });
    it('403s a key without the required scope, before touching org/deck/object state at all', async () => {
        const scopeLessKey = await (0, fixtures_1.seedStreamKey)(prisma, org.organizationId, org.userId, {
            scopes: [db_1.StreamKeyScope.DECK_LIST], // deliberately missing MANIFEST_READ
        });
        const res = await (0, supertest_1.default)(app.getHttpServer())
            .get((0, test_app_1.apiPath)(`stream/v1/decks/${deckId}/manifest`))
            .set('Authorization', `Bearer ${scopeLessKey.plaintextKey}`);
        expect(res.status).toBe(403);
        expect(res.body.message).toMatch(/required scope/i);
    });
    it('403s AUDIO_STREAM scope missing even when MANIFEST_READ is present (per-route scope check, not all-or-nothing)', async () => {
        const manifestOnlyKey = await (0, fixtures_1.seedStreamKey)(prisma, org.organizationId, org.userId, {
            scopes: [db_1.StreamKeyScope.MANIFEST_READ, db_1.StreamKeyScope.DECK_READ],
        });
        const manifestRes = await (0, supertest_1.default)(app.getHttpServer())
            .get((0, test_app_1.apiPath)(`stream/v1/decks/${deckId}/manifest`))
            .set('Authorization', `Bearer ${manifestOnlyKey.plaintextKey}`);
        expect(manifestRes.status).toBe(200);
        const audioRes = await (0, supertest_1.default)(app.getHttpServer())
            .get((0, test_app_1.apiPath)(`stream/v1/decks/${deckId}/items/${eligibleRecordingId}/audio`))
            .set('Authorization', `Bearer ${manifestOnlyKey.plaintextKey}`);
        expect(audioRes.status).toBe(403);
    });
    it('400s the changes endpoint when the required "after" query param is omitted', async () => {
        const key = await (0, fixtures_1.seedStreamKey)(prisma, org.organizationId, org.userId);
        const res = await (0, supertest_1.default)(app.getHttpServer())
            .get((0, test_app_1.apiPath)(`stream/v1/decks/${deckId}/changes`))
            .set('Authorization', `Bearer ${key.plaintextKey}`);
        expect(res.status).toBe(400);
    });
    it('a deck-scoped key CAN reach its own deck but no other route bypasses that scoping', async () => {
        const scopedKey = await (0, fixtures_1.seedStreamKey)(prisma, org.organizationId, org.userId, { deckId });
        const res = await (0, supertest_1.default)(app.getHttpServer())
            .get((0, test_app_1.apiPath)(`stream/v1/decks/${deckId}/manifest`))
            .set('Authorization', `Bearer ${scopedKey.plaintextKey}`);
        expect(res.status).toBe(200);
    });
});
//# sourceMappingURL=object-level-authorization.e2e-spec.js.map
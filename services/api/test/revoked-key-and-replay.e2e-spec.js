"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
const test_app_1 = require("./support/test-app");
const prisma_service_1 = require("../src/prisma/prisma.service");
const fixtures_1 = require("./support/fixtures");
const stream_keys_service_1 = require("../src/voice-stream/stream-api/stream-keys.service");
/**
 * Section 64: "revoked-key tests" + "request replay tests". Stream Keys are
 * DB-backed and instantly revocable (StreamKeyAuthGuard hits the DB every
 * request); OAuth M2M JWTs are stateless and NOT instantly revocable by
 * design (see oauth-jwt-auth.guard.ts) -- both behaviors are asserted
 * explicitly below so a future change to either posture fails a test
 * instead of silently shipping.
 */
describe('revoked-key and replay tests', () => {
    let app;
    let prisma;
    let org;
    let deckId;
    let recordingId;
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
        recordingId = recording.recordingId;
        recordingIds.push(recordingId);
        await (0, fixtures_1.addDeckItem)(prisma, deckId, recordingId, org.userId);
    });
    afterAll(async () => {
        await (0, fixtures_1.cleanupRecordings)(prisma, recordingIds);
        await (0, fixtures_1.cleanupOrgs)(prisma, orgIds);
        await (0, test_app_1.closeTestApp)(app);
    });
    describe('Stream Keys', () => {
        it('rejects a key with revokedAt already set', async () => {
            const key = await (0, fixtures_1.seedStreamKey)(prisma, org.organizationId, org.userId, { revoked: true });
            const res = await (0, supertest_1.default)(app.getHttpServer())
                .get((0, test_app_1.apiPath)(`stream/v1/decks/${deckId}/manifest`))
                .set('Authorization', `Bearer ${key.plaintextKey}`);
            expect(res.status).toBe(401);
            expect(res.body.message).toMatch(/revoked/i);
        });
        it('rejects a key with an expiresAt in the past', async () => {
            const key = await (0, fixtures_1.seedStreamKey)(prisma, org.organizationId, org.userId, {
                expiresAt: new Date(Date.now() - 60_000),
            });
            const res = await (0, supertest_1.default)(app.getHttpServer())
                .get((0, test_app_1.apiPath)(`stream/v1/decks/${deckId}/manifest`))
                .set('Authorization', `Bearer ${key.plaintextKey}`);
            expect(res.status).toBe(401);
            expect(res.body.message).toMatch(/expired/i);
        });
        it('a valid key works, then stops working the instant it is revoked (DB-backed revocation)', async () => {
            const key = await (0, fixtures_1.seedStreamKey)(prisma, org.organizationId, org.userId);
            const before = await (0, supertest_1.default)(app.getHttpServer())
                .get((0, test_app_1.apiPath)(`stream/v1/decks/${deckId}/manifest`))
                .set('Authorization', `Bearer ${key.plaintextKey}`);
            expect(before.status).toBe(200);
            await prisma.streamApiKey.update({
                where: { id: key.keyId },
                data: { revokedAt: new Date() },
            });
            const after = await (0, supertest_1.default)(app.getHttpServer())
                .get((0, test_app_1.apiPath)(`stream/v1/decks/${deckId}/manifest`))
                .set('Authorization', `Bearer ${key.plaintextKey}`);
            expect(after.status).toBe(401);
        });
        it('rotate() invalidates the old plaintext key and issues a working new one (replay of the old key fails)', async () => {
            const keysService = app.get(stream_keys_service_1.StreamKeysService);
            const key = await (0, fixtures_1.seedStreamKey)(prisma, org.organizationId, org.userId);
            const rotated = await keysService.rotate(org.organizationId, key.keyId, org.userId);
            const oldKeyReplay = await (0, supertest_1.default)(app.getHttpServer())
                .get((0, test_app_1.apiPath)(`stream/v1/decks/${deckId}/manifest`))
                .set('Authorization', `Bearer ${key.plaintextKey}`);
            expect(oldKeyReplay.status).toBe(401);
            const newKeyWorks = await (0, supertest_1.default)(app.getHttpServer())
                .get((0, test_app_1.apiPath)(`stream/v1/decks/${deckId}/manifest`))
                .set('Authorization', `Bearer ${rotated.plaintextKey}`);
            expect(newKeyWorks.status).toBe(200);
        });
        it('rejects an empty/garbage bearer token', async () => {
            const res = await (0, supertest_1.default)(app.getHttpServer())
                .get((0, test_app_1.apiPath)(`stream/v1/decks/${deckId}/manifest`))
                .set('Authorization', 'Bearer not-a-real-key');
            expect(res.status).toBe(401);
            expect(res.body.message).toMatch(/invalid stream key/i);
        });
        it('rejects a request with no Authorization header at all', async () => {
            const res = await (0, supertest_1.default)(app.getHttpServer()).get((0, test_app_1.apiPath)(`stream/v1/decks/${deckId}/manifest`));
            expect(res.status).toBe(401);
        });
    });
    describe('OAuth M2M (documented non-instant-revocation tradeoff)', () => {
        it('a JWT minted for a client that is THEN revoked still authenticates (stateless verification, no DB check)', async () => {
            const client = await (0, fixtures_1.seedOAuthClient)(prisma, org.organizationId, org.userId);
            await prisma.oAuthClient.update({
                where: { id: client.oauthClientRowId },
                data: { revokedAt: new Date() },
            });
            const res = await (0, supertest_1.default)(app.getHttpServer())
                .get((0, test_app_1.apiPath)(`stream/v1/decks/${deckId}/manifest`))
                .set('Authorization', `Bearer ${client.jwt}`);
            // Intentional: OAuthJwtAuthGuard never queries OAuthClient.revokedAt.
            // If this starts failing, either the guard now checks revocation (update
            // this test) or something else broke -- do not "fix" by deleting it.
            expect(res.status).toBe(200);
        });
        it('rejects a malformed/garbage JWT-shaped token (3 dot-segments, invalid signature)', async () => {
            const res = await (0, supertest_1.default)(app.getHttpServer())
                .get((0, test_app_1.apiPath)(`stream/v1/decks/${deckId}/manifest`))
                .set('Authorization', 'Bearer aaaa.bbbb.cccc');
            expect(res.status).toBe(401);
        });
    });
    describe('malformed Range header handling on the audio route', () => {
        it('rejects a malformed Range header with 400, not 500', async () => {
            const key = await (0, fixtures_1.seedStreamKey)(prisma, org.organizationId, org.userId);
            const res = await (0, supertest_1.default)(app.getHttpServer())
                .get((0, test_app_1.apiPath)(`stream/v1/decks/${deckId}/items/${recordingId}/audio`))
                .set('Authorization', `Bearer ${key.plaintextKey}`)
                .set('Range', 'not-a-valid-range');
            expect(res.status).toBe(400);
        });
    });
});
//# sourceMappingURL=revoked-key-and-replay.e2e-spec.js.map
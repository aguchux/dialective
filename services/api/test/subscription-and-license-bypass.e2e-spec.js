"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const common_1 = require("@nestjs/common");
const supertest_1 = __importDefault(require("supertest"));
const db_1 = require("@dialectiva/db");
const test_app_1 = require("./support/test-app");
const prisma_service_1 = require("../src/prisma/prisma.service");
const concurrent_stream_guard_1 = require("../src/voice-stream/stream-api/concurrent-stream.guard");
const fixtures_1 = require("./support/fixtures");
/**
 * Section 64: "subscription bypass tests" + "deck-membership bypass tests"
 * + "license bypass tests". "License" in this codebase is enforced as plan
 * limits (concurrent streams, quotas, rate limit) and subscription status
 * (TRIAL/ACTIVE/... vs SUSPENDED/CANCELED) -- there is no separate
 * licensing service, so these tests target RequireActiveSubscriptionGuard,
 * StreamKeySubscriptionGuard, ConcurrentStreamGuard and QuotaGuard
 * directly.
 */
describe('subscription and license bypass', () => {
    let app;
    let prisma;
    const orgIds = [];
    const recordingIds = [];
    beforeAll(async () => {
        app = await (0, test_app_1.createTestApp)();
        prisma = app.get(prisma_service_1.PrismaService);
    });
    afterAll(async () => {
        await (0, fixtures_1.cleanupRecordings)(prisma, recordingIds);
        await (0, fixtures_1.cleanupOrgs)(prisma, orgIds);
        await (0, test_app_1.closeTestApp)(app);
    });
    describe('dashboard-side subscription gate (RequireActiveSubscriptionGuard)', () => {
        it('blocks deck creation for a SUSPENDED subscription', async () => {
            const org = await (0, fixtures_1.seedOrg)(prisma, { subscriptionStatus: db_1.SubscriptionStatus.SUSPENDED });
            orgIds.push(org.organizationId);
            const res = await (0, supertest_1.default)(app.getHttpServer())
                .post((0, test_app_1.apiPath)('voice-stream/stream-decks'))
                .set('Authorization', `Bearer ${org.subscriberJwt}`)
                .send({ name: 'Should not be created' });
            expect(res.status).toBe(403);
        });
        it('blocks deck creation for a CANCELED subscription', async () => {
            const org = await (0, fixtures_1.seedOrg)(prisma, { subscriptionStatus: db_1.SubscriptionStatus.CANCELED });
            orgIds.push(org.organizationId);
            const res = await (0, supertest_1.default)(app.getHttpServer())
                .post((0, test_app_1.apiPath)('voice-stream/stream-decks'))
                .set('Authorization', `Bearer ${org.subscriberJwt}`)
                .send({ name: 'Should not be created' });
            expect(res.status).toBe(403);
        });
        it('allows deck creation for a TRIAL subscription (not just ACTIVE)', async () => {
            const org = await (0, fixtures_1.seedOrg)(prisma, { subscriptionStatus: db_1.SubscriptionStatus.TRIAL });
            orgIds.push(org.organizationId);
            const res = await (0, supertest_1.default)(app.getHttpServer())
                .post((0, test_app_1.apiPath)('voice-stream/stream-decks'))
                .set('Authorization', `Bearer ${org.subscriberJwt}`)
                .send({ name: 'Trial deck' });
            expect(res.status).toBe(201);
        });
        it('a suspended org cannot bypass the gate by adding items to an existing deck', async () => {
            const org = await (0, fixtures_1.seedOrg)(prisma, { subscriptionStatus: db_1.SubscriptionStatus.ACTIVE });
            orgIds.push(org.organizationId);
            const deck = await (0, fixtures_1.seedDeck)(prisma, org.organizationId, org.userId);
            const recording = await (0, fixtures_1.seedStreamableRecording)(prisma);
            recordingIds.push(recording.recordingId);
            await prisma.subscription.update({
                where: { organizationId: org.organizationId },
                data: { status: db_1.SubscriptionStatus.SUSPENDED },
            });
            const res = await (0, supertest_1.default)(app.getHttpServer())
                .post((0, test_app_1.apiPath)(`voice-stream/stream-decks/${deck.deckId}/items`))
                .set('Authorization', `Bearer ${org.subscriberJwt}`)
                .send({ recordingId: recording.recordingId });
            expect(res.status).toBe(403);
        });
    });
    describe('Stream Key-side subscription gate (StreamKeySubscriptionGuard)', () => {
        it('blocks manifest reads once the org subscription is SUSPENDED, even with a valid, in-scope key', async () => {
            const org = await (0, fixtures_1.seedOrg)(prisma, { subscriptionStatus: db_1.SubscriptionStatus.ACTIVE });
            orgIds.push(org.organizationId);
            const deck = await (0, fixtures_1.seedDeck)(prisma, org.organizationId, org.userId);
            const key = await (0, fixtures_1.seedStreamKey)(prisma, org.organizationId, org.userId);
            const before = await (0, supertest_1.default)(app.getHttpServer())
                .get((0, test_app_1.apiPath)(`stream/v1/decks/${deck.deckId}/manifest`))
                .set('Authorization', `Bearer ${key.plaintextKey}`);
            expect(before.status).toBe(200);
            await prisma.subscription.update({
                where: { organizationId: org.organizationId },
                data: { status: db_1.SubscriptionStatus.SUSPENDED },
            });
            const after = await (0, supertest_1.default)(app.getHttpServer())
                .get((0, test_app_1.apiPath)(`stream/v1/decks/${deck.deckId}/manifest`))
                .set('Authorization', `Bearer ${key.plaintextKey}`);
            expect(after.status).toBe(403);
        });
        it('blocks a Stream Key entirely when the org has no Subscription row at all', async () => {
            const suffix = Math.random().toString(36).slice(2, 8);
            const org = await prisma.subscriberOrganization.create({
                data: { name: `No-sub org ${suffix}`, slug: `no-sub-${suffix}` },
            });
            const user = await prisma.subscriberUser.create({
                data: {
                    email: `nosub-${suffix}@test.dialectlibrary.com`,
                    passwordHash: 'unused',
                    firstName: 'No',
                    lastName: 'Sub',
                },
            });
            orgIds.push(org.id);
            const deck = await (0, fixtures_1.seedDeck)(prisma, org.id, user.id);
            const key = await (0, fixtures_1.seedStreamKey)(prisma, org.id, user.id);
            const res = await (0, supertest_1.default)(app.getHttpServer())
                .get((0, test_app_1.apiPath)(`stream/v1/decks/${deck.deckId}/manifest`))
                .set('Authorization', `Bearer ${key.plaintextKey}`);
            expect(res.status).toBe(403);
        });
    });
    describe('concurrent-stream cap (license limit bypass)', () => {
        it('rejects the (limit+1)th concurrent audio stream with 429', async () => {
            const org = await (0, fixtures_1.seedOrg)(prisma, { planOverrides: { maxConcurrentStreams: 1 } });
            orgIds.push(org.organizationId);
            const deck = await (0, fixtures_1.seedDeck)(prisma, org.organizationId, org.userId);
            const recording = await (0, fixtures_1.seedStreamableRecording)(prisma);
            recordingIds.push(recording.recordingId);
            await (0, fixtures_1.addDeckItem)(prisma, deck.deckId, recording.recordingId, org.userId);
            const key = await (0, fixtures_1.seedStreamKey)(prisma, org.organizationId, org.userId);
            // ConcurrentStreamGuard's counter is only released in the audio
            // controller's `finally`, which only runs once a request completes --
            // so to hold a "slot" open deterministically we invoke the guard
            // directly rather than racing two real HTTP requests against a fake
            // storage backend.
            const guard = app.get(concurrent_stream_guard_1.ConcurrentStreamGuard);
            const fakeContext = {
                switchToHttp: () => ({
                    getRequest: () => ({ streamKey: { id: key.keyId, organizationId: org.organizationId } }),
                }),
            };
            await guard.canActivate(fakeContext); // holds slot 1/1
            try {
                await guard.canActivate(fakeContext);
                throw new Error('expected canActivate to reject');
            }
            catch (err) {
                expect(err).toBeInstanceOf(common_1.HttpException);
                expect(err.getStatus()).toBe(429);
            }
            guard.release(key.keyId);
        });
    });
    describe('monthly quota cap (license bypass)', () => {
        it('rejects further manifest reads once monthlyRequestQuota is exhausted', async () => {
            const org = await (0, fixtures_1.seedOrg)(prisma, { planOverrides: { monthlyRequestQuota: 1 } });
            orgIds.push(org.organizationId);
            const deck = await (0, fixtures_1.seedDeck)(prisma, org.organizationId, org.userId);
            const key = await (0, fixtures_1.seedStreamKey)(prisma, org.organizationId, org.userId);
            const periodStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
            await prisma.usageCounter.create({
                data: {
                    organizationId: org.organizationId,
                    periodStart,
                    bytesUsed: BigInt(0),
                    requestsUsed: 1,
                },
            });
            const res = await (0, supertest_1.default)(app.getHttpServer())
                .get((0, test_app_1.apiPath)(`stream/v1/decks/${deck.deckId}/manifest`))
                .set('Authorization', `Bearer ${key.plaintextKey}`);
            expect(res.status).toBe(429);
            expect(res.body.message).toMatch(/quota exceeded/i);
        });
        it('a null plan quota means unlimited -- never touches UsageCounter at all', async () => {
            const org = await (0, fixtures_1.seedOrg)(prisma, {
                planOverrides: { monthlyRequestQuota: null, monthlyByteQuota: null },
            });
            orgIds.push(org.organizationId);
            const deck = await (0, fixtures_1.seedDeck)(prisma, org.organizationId, org.userId);
            const key = await (0, fixtures_1.seedStreamKey)(prisma, org.organizationId, org.userId);
            const res = await (0, supertest_1.default)(app.getHttpServer())
                .get((0, test_app_1.apiPath)(`stream/v1/decks/${deck.deckId}/manifest`))
                .set('Authorization', `Bearer ${key.plaintextKey}`);
            expect(res.status).toBe(200);
        });
    });
    describe('deck-membership bypass via role escalation', () => {
        it('a VALIDATOR (read-only role) cannot create or mutate decks', async () => {
            const org = await (0, fixtures_1.seedOrg)(prisma, { orgRole: db_1.SubscriberOrgRole.VALIDATOR });
            orgIds.push(org.organizationId);
            const res = await (0, supertest_1.default)(app.getHttpServer())
                .post((0, test_app_1.apiPath)('voice-stream/stream-decks'))
                .set('Authorization', `Bearer ${org.subscriberJwt}`)
                .send({ name: 'Should be forbidden' });
            expect(res.status).toBe(403);
        });
        it('a VALIDATOR can still read the org\'s own deck list (read is not role-gated)', async () => {
            const org = await (0, fixtures_1.seedOrg)(prisma, { orgRole: db_1.SubscriberOrgRole.VALIDATOR });
            orgIds.push(org.organizationId);
            const res = await (0, supertest_1.default)(app.getHttpServer())
                .get((0, test_app_1.apiPath)('voice-stream/stream-decks'))
                .set('Authorization', `Bearer ${org.subscriberJwt}`);
            expect(res.status).toBe(200);
        });
        it('documents the stale-JWT privilege-persistence window: a downgraded member keeps OWNER-level access until the JWT expires', async () => {
            const org = await (0, fixtures_1.seedOrg)(prisma, { orgRole: db_1.SubscriberOrgRole.OWNER });
            orgIds.push(org.organizationId);
            // Downgrade the underlying membership directly -- the already-issued
            // JWT's orgRole claim is untouched (subscriber-jwt.util.ts embeds the
            // role at issuance, subscriber-roles.guard.ts never re-fetches it).
            await prisma.subscriberMembership.update({
                where: { userId_organizationId: { userId: org.userId, organizationId: org.organizationId } },
                data: { role: db_1.SubscriberOrgRole.VALIDATOR },
            });
            const res = await (0, supertest_1.default)(app.getHttpServer())
                .post((0, test_app_1.apiPath)('voice-stream/stream-decks'))
                .set('Authorization', `Bearer ${org.subscriberJwt}`)
                .send({ name: 'Created with a stale-OWNER JWT' });
            // Intentional, documented tradeoff (15m JWT TTL bounds the window) --
            // if this starts returning 403, role is now being re-checked against
            // the DB per-request; update this test to match the new behavior
            // rather than treating this failure as a regression to "fix".
            expect(res.status).toBe(201);
        });
    });
    describe('smart deck rule-driven membership (cannot manually add items)', () => {
        it('rejects manual addItem on a SMART deck even for an authorized role', async () => {
            const org = await (0, fixtures_1.seedOrg)(prisma);
            orgIds.push(org.organizationId);
            const recording = await (0, fixtures_1.seedStreamableRecording)(prisma);
            recordingIds.push(recording.recordingId);
            const smartDeck = await (0, supertest_1.default)(app.getHttpServer())
                .post((0, test_app_1.apiPath)('voice-stream/stream-decks'))
                .set('Authorization', `Bearer ${org.subscriberJwt}`)
                .send({
                name: 'Smart deck',
                type: 'SMART',
                rule: { minScore: 0 },
            });
            expect(smartDeck.status).toBe(201);
            const res = await (0, supertest_1.default)(app.getHttpServer())
                .post((0, test_app_1.apiPath)(`voice-stream/stream-decks/${smartDeck.body.id}/items`))
                .set('Authorization', `Bearer ${org.subscriberJwt}`)
                .send({ recordingId: recording.recordingId });
            expect(res.status).toBe(400);
        });
    });
    describe('scope enumeration cannot substitute for AUDIO_STREAM scope', () => {
        it('a key granted every scope EXCEPT AUDIO_STREAM cannot stream audio', async () => {
            const org = await (0, fixtures_1.seedOrg)(prisma);
            orgIds.push(org.organizationId);
            const deck = await (0, fixtures_1.seedDeck)(prisma, org.organizationId, org.userId);
            const recording = await (0, fixtures_1.seedStreamableRecording)(prisma);
            recordingIds.push(recording.recordingId);
            await (0, fixtures_1.addDeckItem)(prisma, deck.deckId, recording.recordingId, org.userId);
            const key = await (0, fixtures_1.seedStreamKey)(prisma, org.organizationId, org.userId, {
                scopes: [
                    db_1.StreamKeyScope.DECK_READ,
                    db_1.StreamKeyScope.DECK_LIST,
                    db_1.StreamKeyScope.METADATA_READ,
                    db_1.StreamKeyScope.MANIFEST_READ,
                    db_1.StreamKeyScope.USAGE_READ,
                ],
            });
            const res = await (0, supertest_1.default)(app.getHttpServer())
                .get((0, test_app_1.apiPath)(`stream/v1/decks/${deck.deckId}/items/${recording.recordingId}/audio`))
                .set('Authorization', `Bearer ${key.plaintextKey}`);
            expect(res.status).toBe(403);
        });
    });
});
//# sourceMappingURL=subscription-and-license-bypass.e2e-spec.js.map
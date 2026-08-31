"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
const test_app_1 = require("./support/test-app");
const prisma_service_1 = require("../src/prisma/prisma.service");
const fixtures_1 = require("./support/fixtures");
/**
 * Section 64: "SSRF tests" + "API key leakage tests". CreateWebhookSubscriptionDto
 * only validates url is a syntactically-valid https:// URL
 * (@IsUrl({protocols:['https']})) -- there is no SSRF-specific check
 * (no loopback/private-IP/link-local/metadata-endpoint block). The actual
 * outbound fetch(subscription.url) happens later, asynchronously, in
 * WebhookDeliveryConsumerService -- these tests document the acceptance-time
 * gap (the fetch itself isn't exercised here: triggering a real outbound
 * request against an internal target is out of scope for an automated
 * suite). Key-leakage tests assert StreamApiKey.keyHash /
 * OAuthClient.secretHash never appear in any HTTP response body, since both
 * services' list()/create() currently select all Prisma columns with no
 * field filtering.
 */
describe('SSRF and API key leakage', () => {
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
    describe('SSRF: webhook target URL validation', () => {
        // Confirmed against class-validator's isURL directly: IP-literal hosts
        // (loopback, RFC1918 private ranges, the cloud metadata endpoint,
        // IPv6 loopback) all pass @IsUrl({protocols:['https']}) -- there is no
        // SSRF-specific denylist. "localhost" happens to be rejected, but only
        // as an incidental side effect of isURL's default TLD requirement, not
        // intentional SSRF protection -- an attacker doesn't need a hostname,
        // a raw IP works fine, so this is a real, exploitable gap.
        const acceptedTargets = [
            'https://127.0.0.1/hook',
            'https://169.254.169.254/latest/meta-data/', // cloud metadata endpoint
            'https://10.0.0.5/internal',
            'https://192.168.1.1/router-admin',
            'https://[::1]/hook',
        ];
        it.each(acceptedTargets)('documents that %s is currently ACCEPTED at creation time (no SSRF-specific validation)', async (url) => {
            const res = await (0, supertest_1.default)(app.getHttpServer())
                .post((0, test_app_1.apiPath)('voice-stream/webhooks'))
                .set('Authorization', `Bearer ${org.subscriberJwt}`)
                .send({ url, eventTypes: ['API_KEY_CREATED'] });
            // Intentional documentation of a real gap, not desired behavior:
            // @IsUrl({protocols:['https']}) has no loopback/private-IP/
            // metadata-endpoint denylist. If this suite is ever extended to add
            // that validation, these should start returning 400 -- update this
            // test to match, don't just delete it.
            expect(res.status).toBe(201);
            await prisma.webhookSubscription.deleteMany({ where: { url } });
        });
        it('rejects "localhost" as a hostname -- but only incidentally, via isURL\'s default TLD requirement, not SSRF-specific validation', async () => {
            const res = await (0, supertest_1.default)(app.getHttpServer())
                .post((0, test_app_1.apiPath)('voice-stream/webhooks'))
                .set('Authorization', `Bearer ${org.subscriberJwt}`)
                .send({ url: 'https://localhost/hook', eventTypes: ['API_KEY_CREATED'] });
            expect(res.status).toBe(400);
        });
        it('rejects a non-https URL (existing protocol validation still works)', async () => {
            const res = await (0, supertest_1.default)(app.getHttpServer())
                .post((0, test_app_1.apiPath)('voice-stream/webhooks'))
                .set('Authorization', `Bearer ${org.subscriberJwt}`)
                .send({ url: 'http://example.com/hook', eventTypes: ['API_KEY_CREATED'] });
            expect(res.status).toBe(400);
        });
    });
    describe('API key leakage: StreamApiKey.keyHash must never appear in a response', () => {
        it('list() response contains keyPrefix but never keyHash', async () => {
            await (0, fixtures_1.seedStreamKey)(prisma, org.organizationId, org.userId);
            const res = await (0, supertest_1.default)(app.getHttpServer())
                .get((0, test_app_1.apiPath)('voice-stream/stream-keys'))
                .set('Authorization', `Bearer ${org.subscriberJwt}`);
            expect(res.status).toBe(200);
            const bodyText = JSON.stringify(res.body);
            expect(bodyText).not.toMatch(/"keyHash"/);
            expect(bodyText).toMatch(/"keyPrefix"/);
        });
        it('create() response contains plaintextKey but never keyHash', async () => {
            const res = await (0, supertest_1.default)(app.getHttpServer())
                .post((0, test_app_1.apiPath)('voice-stream/stream-keys'))
                .set('Authorization', `Bearer ${org.subscriberJwt}`)
                .send({ scopes: ['DECK_LIST'] });
            expect(res.status).toBe(201);
            const bodyText = JSON.stringify(res.body);
            expect(bodyText).not.toMatch(/"keyHash"/);
            expect(bodyText).toMatch(/"plaintextKey"/);
        });
    });
    describe('API key leakage: OAuthClient.secretHash must never appear in a response', () => {
        it('list() response never contains secretHash', async () => {
            const res = await (0, supertest_1.default)(app.getHttpServer())
                .post((0, test_app_1.apiPath)('voice-stream/oauth/clients'))
                .set('Authorization', `Bearer ${org.subscriberJwt}`)
                .send({ scopes: ['DECK_LIST'] });
            expect(res.status).toBe(201);
            expect(JSON.stringify(res.body)).not.toMatch(/"secretHash"/);
            const listRes = await (0, supertest_1.default)(app.getHttpServer())
                .get((0, test_app_1.apiPath)('voice-stream/oauth/clients'))
                .set('Authorization', `Bearer ${org.subscriberJwt}`);
            expect(listRes.status).toBe(200);
            const bodyText = JSON.stringify(listRes.body);
            expect(bodyText).not.toMatch(/"secretHash"/);
            expect(bodyText).toMatch(/"clientId"/);
        });
    });
    describe('negative control: subscriber user listing never leaks passwordHash', () => {
        it('member listing never contains passwordHash', async () => {
            const res = await (0, supertest_1.default)(app.getHttpServer())
                .get((0, test_app_1.apiPath)('voice-stream/organization/members'))
                .set('Authorization', `Bearer ${org.subscriberJwt}`);
            expect([200, 404]).toContain(res.status);
            if (res.status === 200) {
                expect(JSON.stringify(res.body)).not.toMatch(/"passwordHash"/);
            }
        });
    });
});
//# sourceMappingURL=ssrf-and-key-leakage.e2e-spec.js.map